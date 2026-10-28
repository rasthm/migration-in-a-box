"""Turns the raw screen recording into the final video with the ElevenLabs voice-over.

Inputs (in demo/build/): screen3.mkv (ffmpeg gdigrab of the Chrome window), ffmpeg-rec3.log
(its wall-clock start time), rec01.mp3..rec08.mp3 (voiceover.mjs recording-narration.json rec),
and the scene start times the demo wrote into the window title (passed as an argument).
Run:  python demo/make_recording.py "<DEMO title numbers>"
"""
import glob
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
FFMPEG = glob.glob(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin\ffmpeg.exe'))[0]
OUT = os.path.join(HERE, '..', '..', 'video', 'migration-in-a-box-screen-recording.mp4')

CROP_TOP, PAGE_H = 87, 944  # the page area inside the Chrome window (no tabs or address bar)


def main() -> None:
    starts = [int(n) / 1000 for n in re.findall(r'\d{13}', sys.argv[1])]  # 8 scene starts + the end
    log = open(os.path.join(BUILD, 'ffmpeg-rec3.log'), encoding='utf-8', errors='ignore').read()
    rec_start = float(re.search(r'start: ([\d.]+)', log).group(1))
    cut = starts[0] - rec_start - 1.5  # begin 1.5 s before the first scene
    length = starts[-1] - starts[0] + 4.0  # and end 2.5 s after the last one

    voices = sorted(glob.glob(os.path.join(BUILD, 'rec0*.mp3')))
    args = [FFMPEG, '-y', '-loglevel', 'error', '-ss', f'{cut:.3f}', '-t', f'{length:.3f}', '-i', os.path.join(BUILD, 'screen3.mkv')]
    for v in voices:
        args += ['-i', v]
    delays = [(s - starts[0] + 1.5 + 0.4) for s in starts[: len(voices)]]  # voice starts 0.4 s into each scene
    filters = [f'[0:v]crop=1920:{PAGE_H}:0:{CROP_TOP},fade=in:0:20,fade=out:st={length - 1:.2f}:d=1,format=yuv420p[v]']
    for i, d in enumerate(delays, 1):
        ms = int(d * 1000)
        filters.append(f'[{i}:a]adelay={ms}|{ms}[a{i}]')
    filters.append(''.join(f'[a{i}]' for i in range(1, len(voices) + 1)) + f'amix=inputs={len(voices)}:normalize=0[a]')
    args += ['-filter_complex', ';'.join(filters), '-map', '[v]', '-map', '[a]', '-r', '30',
             '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUT]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    subprocess.run(args, check=True)
    print('Done:', os.path.abspath(OUT), f'{length:.0f}s')


if __name__ == '__main__':
    main()
