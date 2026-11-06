# Lists the text Windows can see in the open Advisor window. It only reads; it changes nothing.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$MaxItems = 8000
$MaxSeconds = 60
$OutFile = Join-Path ([Environment]::GetFolderPath('Desktop')) 'advisor-screen-read.txt'

$proc = Get-Process -Name 'Advisor' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
    Select-Object -First 1

if (-not $proc) {
    Write-Host 'Advisor is not open. Open a stone in Advisor, then run this again.'
    exit 1
}

$root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$lines = New-Object System.Collections.Generic.List[string]
$script:count = 0

function Read-Element($element, $depth) {
    if ($script:count -ge $MaxItems -or $clock.Elapsed.TotalSeconds -ge $MaxSeconds) { return }
    $script:count++
    try {
        $info = $element.Current
        $value = ''
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
            $value = $pattern.Current.Value
        }
        $type = $info.ControlType.ProgrammaticName -replace 'ControlType\.', ''
        $box = $info.BoundingRectangle
        $where = '{0:0},{1:0} {2:0}x{3:0}' -f $box.X, $box.Y, $box.Width, $box.Height
        $lines.Add(('{0}{1} | {2} | {3} | {4} | {5}' -f (' ' * $depth), $type, $info.ClassName, $info.Name, $value, $where))
    } catch {
        return
    }
    try {
        $child = $walker.GetFirstChild($element)
        while ($child -ne $null) {
            Read-Element $child ($depth + 1)
            $child = $walker.GetNextSibling($child)
        }
    } catch { }
}

Write-Host 'Reading the Advisor window...'
Read-Element $root 0
$lines | Set-Content -Path $OutFile -Encoding UTF8
Write-Host ('Done. {0} items saved to {1}' -f $lines.Count, $OutFile)
