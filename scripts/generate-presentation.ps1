param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\docs\presentation\Skill-Insights-Overview.pptx')
)

$ErrorActionPreference = 'Stop'

function Get-Rgb([string]$Hex) {
    $value = $Hex.TrimStart('#')
    $red = [Convert]::ToInt32($value.Substring(0, 2), 16)
    $green = [Convert]::ToInt32($value.Substring(2, 2), 16)
    $blue = [Convert]::ToInt32($value.Substring(4, 2), 16)
    return $red + ($green * 256) + ($blue * 65536)
}

function Add-Text($Slide, [string]$Text, [float]$Left, [float]$Top, [float]$Width, [float]$Height, [float]$Size, [string]$Color, [bool]$Bold = $false, [string]$Font = 'Aptos', [int]$Align = 1) {
    $shape = $Slide.Shapes.AddTextbox(1, $Left, $Top, $Width, $Height)
    $shape.TextFrame2.MarginLeft = 0
    $shape.TextFrame2.MarginRight = 0
    $shape.TextFrame2.MarginTop = 0
    $shape.TextFrame2.MarginBottom = 0
    $shape.TextFrame.WordWrap = -1
    $shape.TextFrame.TextRange.Text = $Text
    $shape.TextFrame.TextRange.Font.Name = $Font
    $shape.TextFrame.TextRange.Font.Size = $Size
    $shape.TextFrame.TextRange.Font.Bold = if ($Bold) { -1 } else { 0 }
    $shape.TextFrame.TextRange.Font.Color.RGB = Get-Rgb $Color
    $shape.TextFrame.TextRange.ParagraphFormat.Alignment = $Align
    return $shape
}

function Add-Box($Slide, [float]$Left, [float]$Top, [float]$Width, [float]$Height, [string]$Fill, [string]$Line = $Fill, [int]$Type = 5) {
    $shape = $Slide.Shapes.AddShape($Type, $Left, $Top, $Width, $Height)
    $shape.Fill.ForeColor.RGB = Get-Rgb $Fill
    $shape.Line.ForeColor.RGB = Get-Rgb $Line
    $shape.Line.Weight = 0.8
    return $shape
}

function Add-Line($Slide, [float]$X1, [float]$Y1, [float]$X2, [float]$Y2, [string]$Color, [float]$Weight = 1) {
    $line = $Slide.Shapes.AddLine($X1, $Y1, $X2, $Y2)
    $line.Line.ForeColor.RGB = Get-Rgb $Color
    $line.Line.Weight = $Weight
    return $line
}

function Add-Arrow($Slide, [float]$Left, [float]$Top, [float]$Width, [string]$Color) {
    $line = Add-Line $Slide $Left $Top ($Left + $Width) $Top $Color 1.5
    $line.Line.EndArrowheadStyle = 3
}

function Set-Background($Slide, [string]$Color) {
    $Slide.FollowMasterBackground = 0
    $Slide.Background.Fill.Solid()
    $Slide.Background.Fill.ForeColor.RGB = Get-Rgb $Color
}

function Add-Header($Slide, [int]$Index, [bool]$Dark) {
    $ink = if ($Dark) { '#F2F0E8' } else { '#17201B' }
    $muted = if ($Dark) { '#77877E' } else { '#65736B' }
    Add-Box $Slide 34 25 27 27 '#73E2B7' '#73E2B7' | Out-Null
    Add-Text $Slide 'SI' 34 31 27 14 9 '#102018' $true 'Aptos' 2 | Out-Null
    Add-Text $Slide 'Skill Insights' 69 29 125 18 12 $ink $true | Out-Null
    Add-Text $Slide 'FOR VS CODE' 199 31 90 13 7 $muted $true 'Cascadia Mono' | Out-Null
    Add-Text $Slide (('{0:D2} / 05' -f $Index)) 878 31 48 13 8 $muted $true 'Cascadia Mono' 3 | Out-Null
}

function Add-Title($Slide, [string]$Kicker, [string]$Line1, [string]$Line2, [bool]$Dark, [float]$Top = 95) {
    $ink = if ($Dark) { '#F5F4EF' } else { '#152019' }
    $accent = if ($Dark) { '#73E2B7' } else { '#24795C' }
    Add-Text $Slide $Kicker.ToUpperInvariant() 46 $Top 450 15 8 $accent $true 'Cascadia Mono' | Out-Null
    Add-Text $Slide $Line1 46 ($Top + 27) 560 42 29 $ink $true | Out-Null
    Add-Text $Slide $Line2 46 ($Top + 65) 620 42 29 $accent $true | Out-Null
}

function Add-Screenshot($Slide, [string]$Path, [float]$Left, [float]$Top, [float]$Width, [float]$Height, [string]$Name) {
    Add-Box $Slide $Left $Top $Width $Height '#101411' '#526159' | Out-Null
    Add-Box $Slide ($Left + 1) ($Top + 1) ($Width - 2) 22 '#1B211D' '#1B211D' 1 | Out-Null
    Add-Text $Slide 'SKILL INSIGHTS  /  SKILL.md' ($Left + 35) ($Top + 7) 210 10 6 '#8DAAA0' $false 'Cascadia Mono' | Out-Null
    foreach ($offset in 0, 9, 18) { Add-Box $Slide ($Left + 10 + $offset) ($Top + 8) 5 5 '#73E2B7' '#73E2B7' 9 | Out-Null }
    $picture = $Slide.Shapes.AddPicture($Path, 0, -1, $Left + 2, $Top + 24, $Width - 4, $Height - 26)
    $picture.Name = $Name
    $picture.AlternativeText = 'Replace this screenshot with a product video when available.'
}

$powerPoint = $null
$presentation = $null

try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.Visible = -1
    $presentation = $powerPoint.Presentations.Add()
    $presentation.PageSetup.SlideWidth = 960
    $presentation.PageSetup.SlideHeight = 540

    $root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $flowScreenshot = Join-Path $root 'media\screenshot-flow.png'
    $zoomScreenshot = Join-Path $root 'media\zoom-pan-after.png'

    # 1. Motivation
    $slide = $presentation.Slides.Add(1, 12)
    Set-Background $slide '#111713'; Add-Header $slide 1 $true
    Add-Title $slide 'The review gap' 'AI skills are' 'executable intent.' $true 105
    Add-Text $slide 'Yet teams still review them as long prose files. Triggers, decisions, tools, permissions, and failure paths stay hidden until execution.' 46 237 390 75 13 '#9BA89F' | Out-Null
    Add-Box $slide 520 124 145 225 '#171E1A' '#455249' | Out-Null
    Add-Text $slide 'SKILL.md' 537 143 100 15 8 '#8C9991' $true 'Cascadia Mono' | Out-Null
    foreach ($line in 0..6) { Add-Box $slide 537 (181 + ($line * 20)) $(if (($line % 3) -eq 0) { 82 } else { 105 }) 5 '#354139' '#354139' 1 | Out-Null }
    Add-Arrow $slide 686 236 48 '#73E2B7'
    Add-Box $slide 758 167 155 137 '#18251F' '#4D665A' | Out-Null
    Add-Box $slide 811 189 49 49 '#73E2B7' '#73E2B7' | Out-Null
    Add-Text $slide 'FLOW' 811 205 49 13 9 '#102018' $true 'Cascadia Mono' 2 | Out-Null
    Add-Text $slide 'Inspectable flow' 773 250 125 18 14 '#F2F0E8' $true 'Aptos' 2 | Out-Null
    Add-Text $slide 'before you run it' 773 274 125 13 8 '#87958D' $false 'Cascadia Mono' 2 | Out-Null
    Add-Line $slide 46 456 914 456 '#344038' | Out-Null
    Add-Text $slide 'Make AI automation reviewable with the same discipline as code.' 46 470 700 25 15 '#73E2B7' | Out-Null

    # 2. Added value
    $slide = $presentation.Slides.Add(2, 12)
    Set-Background $slide '#111713'; Add-Header $slide 2 $true
    Add-Title $slide 'Basic added value' 'From opaque prose to' 'reviewable engineering.' $true 91
    $values = @(
        @('01', 'UNDERSTAND', 'See triggers, branches, tools, outputs, and error paths.'),
        @('02', 'TRUST', 'Surface findings and sensitive capabilities in context.'),
        @('03', 'IMPROVE', 'Edit graph properties with undo and manual positioning.'),
        @('04', 'STAY GROUNDED', 'Navigate between visual blocks and source spans.')
    )
    for ($index = 0; $index -lt $values.Count; $index++) {
        $left = 46 + ($index * 218)
        Add-Line $slide $left 250 ($left + 194) 250 '#526159' 1.5 | Out-Null
        Add-Text $slide $values[$index][0] $left 268 35 14 8 '#77877E' $true 'Cascadia Mono' | Out-Null
        Add-Box $slide $left 302 42 42 '#18352A' '#2D5947' | Out-Null
        Add-Text $slide '+' $left 312 42 18 16 '#73E2B7' $true 'Aptos' 2 | Out-Null
        Add-Text $slide $values[$index][1] $left 360 185 18 12 '#F2F0E8' $true | Out-Null
        Add-Text $slide $values[$index][2] $left 388 185 48 9 '#9BA89F' | Out-Null
    }
    Add-Text $slide 'MODEL-NEUTRAL SKILLGRAPH   /   LOCAL-FIRST ANALYSIS   /   VS CODE + BROWSER' 195 485 570 14 8 '#8DAAA0' $true 'Cascadia Mono' 2 | Out-Null

    # 3. Discover, parse, inspect
    $slide = $presentation.Slides.Add(3, 12)
    Set-Background $slide '#111713'; Add-Header $slide 3 $true
    Add-Title $slide 'Discover / Parse / Inspect' 'Open any skill.' 'See how it behaves.' $true 98
    Add-Text $slide 'Workspace and personal skills are discovered, parsed into a model-neutral graph, and opened beside their source.' 46 218 300 75 11 '#9BA89F' | Out-Null
    Add-Screenshot $slide $flowScreenshot 389 91 525 283 'Replaceable product screenshot - inspect'
    $steps = @(@('01', 'DISCOVER', 'workspace + personal'), @('02', 'PARSE', 'SkillGraph IR'), @('03', 'INSPECT', 'flow + source'))
    for ($index = 0; $index -lt 3; $index++) {
        $left = 46 + ($index * 226)
        Add-Box $slide $left 390 190 70 '#18201B' '#526159' | Out-Null
        Add-Text $slide $steps[$index][0] ($left + 12) 402 26 11 7 '#77877E' $true 'Cascadia Mono' | Out-Null
        Add-Text $slide $steps[$index][1] ($left + 45) 400 130 16 11 '#F2F0E8' $true | Out-Null
        Add-Text $slide $steps[$index][2] ($left + 45) 423 130 12 7 '#9BA89F' $false 'Cascadia Mono' | Out-Null
        if ($index -lt 2) { Add-Arrow $slide ($left + 194) 425 24 '#73E2B7' }
    }
    Add-Text $slide 'IMPLEMENTED: search, filters, grouping, zoom, pan, minimap, and source navigation.' 46 493 740 13 8 '#24795C' $true 'Cascadia Mono' | Out-Null

    # 4. Edit and validate
    $slide = $presentation.Slides.Add(4, 12)
    Set-Background $slide '#121719'; Add-Header $slide 4 $true
    Add-Title $slide 'Edit / Validate / Explain' 'Change with context.' 'Review the impact.' $true 96
    Add-Text $slide 'Inspect and edit node properties, move blocks, undo changes, preview Markdown, and keep the selected block synchronized with source.' 46 214 300 80 11 '#94A0A4' | Out-Null
    Add-Screenshot $slide $zoomScreenshot 389 91 525 283 'Replaceable product screenshot - validate'
    $checks = @(@('EDIT', 'Visual editing', 'Properties, layout, undo / redo'), @('CHECK', 'Findings in context', 'Structure, references, permissions'), @('CHAT', 'Chat assistance', 'Explain, validate, and fix intents'))
    for ($index = 0; $index -lt 3; $index++) {
        $left = 46 + ($index * 294)
        Add-Box $slide $left 397 270 70 '#18201B' '#3A4649' | Out-Null
        Add-Text $slide $checks[$index][0] ($left + 15) 410 45 12 7 '#6BA7ED' $true 'Cascadia Mono' | Out-Null
        Add-Text $slide $checks[$index][1] ($left + 70) 407 180 16 11 '#E5E9E7' $true | Out-Null
        Add-Text $slide $checks[$index][2] ($left + 70) 432 180 12 7 '#758388' $false 'Cascadia Mono' | Out-Null
    }
    Add-Text $slide 'AVAILABLE NOW' 46 493 95 13 8 '#73E2B7' $true 'Cascadia Mono' | Out-Null
    Add-Text $slide 'Editing is in-memory today; provider export remains planned.' 150 492 420 14 9 '#839096' | Out-Null

    # 5. End-to-end flow
    $slide = $presentation.Slides.Add(5, 12)
    Set-Background $slide '#111713'; Add-Header $slide 5 $true
    Add-Title $slide 'End-to-end flow' 'One continuous review loop,' 'inside the developer workflow.' $true 87
    $journey = @(
        @('01', 'DISCOVER', 'workspace + personal'), @('02', 'NORMALIZE', 'parse to SkillGraph'),
        @('03', 'EXPLORE', 'group / filter / zoom'), @('04', 'REFINE', 'edit and undo'),
        @('05', 'VALIDATE', 'findings on blocks'), @('06', 'ACT', 'VS Code chat')
    )
    for ($index = 0; $index -lt 6; $index++) {
        $left = 46 + ($index * 148)
        Add-Line $slide $left 250 ($left + 128) 250 '#526159' 1.4 | Out-Null
        Add-Text $slide $journey[$index][0] $left 267 25 12 7 '#77877E' $true 'Cascadia Mono' | Out-Null
        Add-Box $slide ($left + 38) 288 52 52 '#18352A' '#2D5947' | Out-Null
        Add-Text $slide $journey[$index][0] ($left + 38) 305 52 13 9 '#73E2B7' $true 'Cascadia Mono' 2 | Out-Null
        Add-Text $slide $journey[$index][1] $left 352 128 16 10 '#F2F0E8' $true 'Aptos' 2 | Out-Null
        Add-Text $slide $journey[$index][2] $left 378 128 28 7 '#9BA89F' $false 'Cascadia Mono' 2 | Out-Null
        if ($index -lt 5) { Add-Arrow $slide ($left + 126) 314 19 '#73E2B7' }
    }
    foreach ($status in @(@(46, '#24795C', 'AVAILABLE NOW', 'IR, parsing, validation, visual editor, browser + VS Code'), @(488, '#B27A23', 'NEXT', 'Provider emitters, structural diff, CLI and CI workflows'))) {
        Add-Box $slide $status[0] 433 426 48 '#18201B' '#526159' | Out-Null
        Add-Box $slide ($status[0] + 16) 452 7 7 $status[1] $status[1] 9 | Out-Null
        Add-Text $slide $status[2] ($status[0] + 36) 446 100 13 8 '#F2F0E8' $true 'Cascadia Mono' | Out-Null
        Add-Text $slide $status[3] ($status[0] + 134) 446 275 16 8 '#9BA89F' | Out-Null
    }
    Add-Text $slide 'Understand before enabling. Improve without losing source context.' 46 505 650 16 11 '#24795C' | Out-Null

    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
    if ([System.IO.File]::Exists($resolvedOutput)) { [System.IO.File]::Delete($resolvedOutput) }
    $presentation.SaveAs($resolvedOutput, 24)
    Write-Output "Created $resolvedOutput"
}
finally {
    if ($null -ne $presentation) {
        try { $presentation.Close() } catch { }
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null } catch { }
    }
    if ($null -ne $powerPoint) {
        try { $powerPoint.Quit() } catch { }
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null } catch { }
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}