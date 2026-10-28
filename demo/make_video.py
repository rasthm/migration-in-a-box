"""Builds demo/migration-in-a-box-demo.mp4 from the scene screenshots and a narration.

Voice: the ElevenLabs MP3s made by demo/voiceover.mjs when they exist,
otherwise the Windows built-in voice so the video can still be made.
Run (from the migration-in-a-box folder):
  node --env-file=.env.local demo/voiceover.mjs
  python demo/make_video.py
"""
import glob
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = os.environ.get('FFMPEG') or glob.glob(os.path.expandvars(
    r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin\ffmpeg.exe'))[0]
FFPROBE = FFMPEG.replace('ffmpeg.exe', 'ffprobe.exe')

SCENES = [(s['image'], s['text']) for s in json.load(open(os.path.join(HERE, 'narration.json'), encoding='utf-8'))]


def windows_voice(text: str, out: str) -> None:
    ps = (
        "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.Rate = 0; $s.SetOutputToWaveFile($env:OUT); $s.Speak($env:TEXT); $s.Dispose()"
    )
    subprocess.run(['powershell', '-NoProfile', '-Command', ps], check=True, env={**os.environ, 'OUT': out, 'TEXT': text})


def duration(path: str) -> float:
    r = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def main() -> None:
    work = os.path.join(HERE, 'build')
    # ElevenLabs voice files come from demo/voiceover.mjs; without them the Windows voice is used
    use_eleven = all(os.path.exists(os.path.join(work, f'voice{i:02d}.mp3')) for i in range(1, len(SCENES) + 1))
    print('Voice:', 'ElevenLabs (demo/build/*.mp3)' if use_eleven else 'Windows built-in (run demo/voiceover.mjs for ElevenLabs)')
    os.makedirs(work, exist_ok=True)
    parts = []
    for i, (img, text) in enumerate(SCENES, 1):
        audio = os.path.join(work, f'voice{i:02d}.' + ('mp3' if use_eleven else 'wav'))
        if not use_eleven:
            windows_voice(text, audio)
        seg = os.path.join(work, f'seg{i:02d}.mp4')
        length = duration(audio) + 0.8  # a short pause after each sentence
        subprocess.run([
            FFMPEG, '-y', '-loglevel', 'error', '-loop', '1', '-i', os.path.join(HERE, 'frames', img), '-i', audio,
            '-t', f'{length:.2f}', '-vf', 'scale=1920:-2,format=yuv420p,fade=in:0:12', '-r', '30',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-af', 'apad', seg,
        ], check=True)
        parts.append(seg)
        print(f'scene {i}: {length:.1f}s')
    listfile = os.path.join(work, 'list.txt')
    with open(listfile, 'w') as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    out = os.path.join(HERE, 'migration-in-a-box-demo.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listfile, '-c', 'copy', out], check=True)
    print('Done:', out, f'{duration(out):.0f}s')


if __name__ == '__main__':
    main()
