"""Generate native launcher and splash assets from the existing MIZANK icon."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
native = root / 'native'
icon = Image.open(root / 'icon-512.png').convert('RGBA')

ios_icon = Image.new('RGB', (1024, 1024), '#faf7ff')
ios_icon.paste(icon.resize((1024, 1024), Image.Resampling.LANCZOS), mask=icon.resize((1024, 1024), Image.Resampling.LANCZOS).getchannel('A'))
ios_icon.save(native / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')

densities = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for density, size in densities.items():
    path = native / f'android/app/src/main/res/mipmap-{density}'
    opaque = Image.new('RGB', (size, size), '#faf7ff')
    scaled = icon.resize((size, size), Image.Resampling.LANCZOS)
    opaque.paste(scaled, mask=scaled.getchannel('A'))
    opaque.save(path / 'ic_launcher.png')
    opaque.save(path / 'ic_launcher_round.png')
    foreground = Image.new('RGBA', (size, size))
    mark = icon.resize((round(size * .65), round(size * .65)), Image.Resampling.LANCZOS)
    foreground.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    foreground.save(path / 'ic_launcher_foreground.png')

for splash_path in (native / 'android/app/src/main/res').glob('drawable*/splash.png'):
    old = Image.open(splash_path)
    canvas = Image.new('RGB', old.size, '#f8f5ff')
    size = min(old.size) // 4
    logo = icon.resize((size, size), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((old.width - size) // 2, (old.height - size) // 2), logo)
    canvas.save(splash_path, optimize=True)

ios_splash = native / 'ios/App/App/Assets.xcassets/Splash.imageset'
for name in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    canvas = Image.new('RGB', (2732, 2732), '#f8f5ff')
    logo = icon.resize((520, 520), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((2732 - 520) // 2, (2732 - 520) // 2), logo)
    canvas.save(ios_splash / name, optimize=True)
