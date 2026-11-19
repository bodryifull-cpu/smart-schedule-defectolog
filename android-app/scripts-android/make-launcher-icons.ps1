Add-Type -AssemblyName System.Drawing

$srcPath = 'D:\projectforschoolAPK\public\pwa-512x512.png'
$resDir  = 'D:\projectforschoolAPK\android\app\src\main\res'

$src = [System.Drawing.Image]::FromFile($srcPath)

function Save-Bitmap($bmp, $path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# Обычная иконка: логотип целиком.
function Save-Icon($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    Save-Bitmap $bmp $path
}

# Foreground адаптивной иконки: логотип 68% по центру прозрачного холста
# (маска адаптивной иконки обрезает края).
function Save-Foreground($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $inner = [int]($size * 0.68)
    $off = [int](($size - $inner) / 2)
    $g.DrawImage($src, $off, $off, $inner, $inner)
    $g.Dispose()
    Save-Bitmap $bmp $path
}

$densities = @{
    'mipmap-mdpi'    = @{ icon = 48;  fg = 108 }
    'mipmap-hdpi'    = @{ icon = 72;  fg = 162 }
    'mipmap-xhdpi'   = @{ icon = 96;  fg = 216 }
    'mipmap-xxhdpi'  = @{ icon = 144; fg = 324 }
    'mipmap-xxxhdpi' = @{ icon = 192; fg = 432 }
}

foreach ($dir in $densities.Keys) {
    $s = $densities[$dir]
    $base = Join-Path $resDir $dir
    Save-Icon $s.icon (Join-Path $base 'ic_launcher.png')
    Save-Icon $s.icon (Join-Path $base 'ic_launcher_round.png')
    Save-Foreground $s.fg (Join-Path $base 'ic_launcher_foreground.png')
    Write-Output "generated: $dir"
}

$src.Dispose()
Write-Output 'icons done'
