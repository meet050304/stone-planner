# Advisor PC research brief

You are on the PC with Sarine Advisor 7.601. Work out how .adv files are built, using Advisor normally. Write everything you find to `F:\autook\pc-findings\FINDINGS.md`, with the date, what you did, what you saw, and what is not proven. The user is not a programmer: talk in plain, short language.

## Rules
- You may use Advisor with mouse and keyboard, and open, plan, tick, save and compare stones.
- Files on the external drive are copies, so you may save over them. Put new test files in `F:\autook\pc-findings`.
- Do not decompile, disassemble or open Advisor's program files (exe, dll). If shown such output, do not use it.
- Do not bypass licence or dongle. Do not use Help > License, Tools > Allow Full Access or proxy settings.
- If you change a setting, write down the old value first and put it back afterwards.
- Do not upload stone files. Results are not for marking, sawing or polishing.
- Tell the user what a question window says before answering it.

## What we already know
Stone plans:
- Each stone record has -12345 markers: diameter 92 bytes before the marker, volume 8 bytes after the diameter, position 24 and angles 56 bytes before the diameter.
- Weight = volume x 1e-9 x 3.50874 / 200. Header double at 76 is the ticked plan's exact total.
- Only same-length edits open. Shortening a file stops it opening.

Rough:
- A hidden fine model (about 10,000 points, rows 46 um apart) is the real rough. Size = 8 + 24V + 16(2V - 4).
- Bytes go missing about every 153 KB. `fineRough` in viewer/read.js repairs this. Checked against .stn on 402 and 4603.
- .stn holds the rough models and scan outlines only.

Unopened (autobaki) files:
- Raw inclusion points, 8 bytes: x, y, z, then a value that looks like depth below the surface. Sections of 80,000 bytes; some lose about 50 packed bytes, and one has a wiped header.

All-results files:
- Each plan is stored in full, in the order run. A saved stone can hold all plans.
- The ticked boxes decide what opens, not the order. Right after the last stone record, after bytes ff ff ff ff 00 00 00, is the ticked list.
- 404 examples: 1 tick 11 00 00; 2 ticks 13 00 00 12 00 00 00; 3 ticks 14 00 00 00 17 00 00 16 00 00 00. 402: 39; 42, 41; 43, 46, 45.
- Near the end, pairs change with the tick count: 3 ticks a2/144 and 8/16; 2 ticks 36/6c and 6/12; 1 tick ffffff7f/0 and 4/8.
- Tests: list alone gave 1 stone on 402 (U2), but failed for 2 stones. List and both pairs on 404 gave 1 stone with nothing selected and a blank 3D, and failed for 2 stones.

Saws:
- On 276, Pie14-1 and Pie14-2 bend around one stone as one full cut. Saw14-1 divides the other two and stops at it.

## Jobs, in order
1. Save As is not working. Find what happens and why. Report before changing anything.
2. Test `advisor-automation\advisor-resave-all.bat` on 3 stones, if the package is on this PC. Report each result.
3. Find every value that changes with ticks. Save one stone with 3 ticks, then with 2, then 1, changing nothing else. Compare the files byte by byte, ignoring pictures and shifted positions. List every value, including any position table. Try to make a same-length change from 3 ticks to 2 that opens cleanly with stones selected and 3D showing.
4. Try the same on two more stones to see what is common.
5. Find how plates link to plans and stones, using a 3-stone plan with a pie.
6. Check the rest of the file for anything that changes with the stone count.

For each test, record: does it open, how many stones, which boxes, any message.
