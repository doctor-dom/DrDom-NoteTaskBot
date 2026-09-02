# Generate NoteTaskBot plugin icon: checkbox with check (128x128, e-ink friendly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root 'assets\icon.png'
$size = 128

$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::White)

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 9
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$margin = 22
$box = $size - (2 * $margin)
$g.DrawRectangle($pen, $margin, $margin, $box, $box)

$check = @(
    [System.Drawing.Point]::new(38, 68),
    [System.Drawing.Point]::new(56, 86),
    [System.Drawing.Point]::new(92, 46)
)
$g.DrawLines($pen, $check)

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Host "Wrote $outPath ($size x $size)"
