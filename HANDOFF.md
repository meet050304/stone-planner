# Handover: Advisor-style stone planner (5 Nov 2026)

Give this file, `PROGRESS.md` and `ADVISOR-NOTES.md` to the new session first. They hold the full dated log.

## Who and what
- The user works in the diamond business (not a programmer). Use plain, short language, check results by eye
  against Advisor screenshots, and accept the user's domain corrections.
- Sarine **Advisor 7.601** scans rough diamonds and saves `.adv` files: rough 3D model, inclusions, Advisor's plan
  (polished round stones: position, 3 angles, diameter, proportions; saw planes).
- Our program, `~/Desktop/development/adv-viewer.html` (code in `viewer/`), reads `.adv`, plans for more profit, and
  writes our plan back into a copy of the `.adv` so Advisor shows it. Open it in a browser (Chrome) and drop `.adv`
  files on it. Keep `viewer/` next to the html.
- Profit rules: 22,320 Rs/ct up to 1.25 mm, 14,415 above, Rs 60 labour per stone, 3% polishing loss, sizes
  1.26-1.33 mm blocked. Inclusion safety 10 um. **Rough safety 20 um** (every facet and the 16 girdle corners keep
  20 um from the rough).

## Files and places
| Where | What |
|---|---|
| `~/Desktop/development/adv-viewer.html` + `viewer/` | the program, split 4 Nov: fitter.js (planner search in workers), read.js, view.js (3D, Polish view, Advisor-style panel, Projection, outside patches, orange crosses within 15 um of the rough), plan.js, write.js (.adv writer), bulk.js (Bulk plan, Fill Advisor saves, CSV), tools.js, ui.js, viewer.css |
| `~/Desktop/development/PROGRESS.md`, `ADVISOR-NOTES.md` | dated log and everything decoded about `.adv` (the experiment log) |
| `~/Desktop/development/advisor-automation/` | PowerShell scripts that drive Advisor (open stone, plan, Save As) |
| `~/Desktop/development/backups/` | copies before each change |
| External drive **MY BOOK** (`F:` on the Advisor PC, `/Volumes/MY BOOK` on the Mac) | **all stone files live here; the Mac has little space.** `autook/401-500` Advisor's own stones, `autook/advisor-resaves` Advisor re-saves with our stone count, `autook/output` our filled files and plan files, `autook/volume-test` latest test files, `autook/416-girdle-test` earlier tests, `autook/work` working files |
| Advisor PC | Windows 10, Claude Code CLI installed (same account), project copy with `CLAUDE.md` briefing; it ran the controlled saves in `Desktop\test-276` and writes findings to its `ADVISOR-NOTES.md` |

## Rules (must keep)
- A draft agreement with Sarine (not yet confirmed signed) allows reading, decoding and byte-comparing `.adv` files,
  test copies, writing fields in test copies, and opening them in Advisor to check. It does **not** allow decompiling
  or disassembling Advisor's program files unless a separate signed permission is shown. Do not do it.
- Never bypass Advisor's licence, dongle or protection. Never use Help > License, Tools > Allow Full Access,
  Options or proxy settings. Never copy, upload or send Advisor program files or customers' stone files.
- Keep originals unchanged; work on copies; Save As in Advisor, never plain Save on originals.
- Our files are **not for marking, sawing or polishing** until proven on a real low-value stone and approved in
  writing. Advisor's own plan is used for production.
- Same-length edits only: any change of the file's length or structure crashes Advisor. A different stone count is
  done by an Advisor re-save with that count (automation) and then "Fill Advisor saves".

## What works
- Reading: rough, inclusions, stones, proportions, saws, summary fields.
- Planning: Auto plan 1-3 stones with saws; Bulk plan; rough safety; Advisor's 16-corner girdle.
- Writing, all checked: stone position/angles/diameter in every record copy (found by old values), both proportion
  blocks incl. derived fields 15, 16, 21, polish turn matrix, saw plate and part records, summary fields, and
  (new 5 Nov) each stone's **volume** (um3, 8 bytes after the diameter) and **weight** (ct) in every copy,
  with Advisor's density **3.50874**. Advisor now shows our weights (e.g. 0.0076 ct for a 1.254 mm stone).
- Automation on the Advisor PC: open a stone, run Makeable / Best Pair / Best Remainder, Save As, move to
  `advisor-resaves`.

## The open problem
When we write our stones, Advisor still draws **hatched patches** (stone "outside the rough") in Polish > Inclusion
Projection on some files (401, 402), although our geometry has them 20 um or more inside.

**Test corrected by the user (5 Nov):** on `1.S525-402-vol.adv`, reducing the diameter 0.02 mm in Fine Tune removes the patch. Setting it back brings the patch back, the same as before. The earlier note here said the patch stayed gone: that was wrong. So the patch follows the stone's real size and place, and the stone is really over Advisor's limit there, by no more than about 10 um of radius. There is no hidden stored value to find.

## Next step (updated 5 Nov, this replaces the older steps below where they differ)
401-g48 still shows patches, so exact volume alone is not enough. Still needed from Advisor: does `402-g48` show the patch, and does `1.S525-402-vol-advisor` show it after closing and reopening; then `testB`, `testC` in `F:\autook\402`. With the drive on the Mac: test Advisor's old saw and part model in `advisor-resaves/1.S525-401-ADV2.adv` against stone B at the patch. See the end of `ADVISOR-NOTES.md`.

Way 2 (user's choice, 5 Nov): tried on 401, outlines do not show pits; see the end of `ADVISOR-NOTES.md`. Waiting for the user's view of the black band in scan frames 90-105 of 401.

Tested 5 Nov: `401-g48-states` and `402-g48-states` (Advisor's inclusion states restored) still show patches, so states are not the switch. Also look at why the 1.25 stone sits 59 um inside Use inclusion 419.

Pit safety (5 Nov): planner setting, default 0. Open `F:\autook\pit-test\1.S525-402-pit30`, `pit60`, `pit120` in Advisor to find the lowest setting with no patch. Profit table at the end of `ADVISOR-NOTES.md`.

402 at pit 30 is clean in Advisor (user, 5 Nov). `pit0` still has the patch. Files for pit 20, 15, 10 are in `autook/pit-test`; waiting for the user to find the lowest clean one. Then test that setting on other stones before making it the default.

Pit 10 test (5 Nov): 9 files in `F:\autook\pit10-test`. Waiting for the user's list of clean and patched files. Then decide the default, and fix forced stone counts (use Advisor re-saves at the free search's count) and pie cuts.

Pit safety default is 10 since 5 Nov (user's request); proven only on 402 so far. If `pit10-test` shows patches, review the default. Bulk plan holds every setting under All settings.

**Current direction (5 Nov): Advisor run.** Advisor makes the final plans; see `ADVISOR-RUN-PC.md`. Earlier pit and hidden-field notes above are background.

**Fine rough model (5 Nov):** the planner now uses a fourth rough model in each file that matches the rough weight. See the end of `ADVISOR-NOTES.md`. Hatched patches should come from the old model; check `F:\autook\fine-test` in Advisor.

**Rough safety 5 (5 Nov):** Advisor showed no patches on `F:\autook\fine-test`. Default now 5, Pit safety removed. Older Pit safety notes above are history.

**Full auto Bulk plan (5 Nov):** see `BULK-AUTO-PC.md`. Not yet proven on Advisor.

## Earlier next step
1. In Advisor (that rebuilt state): Save Results, select the stone, Save As `1.S525-402-vol-advisor`.
1b. Added 5 Nov: also make a baseline. Open `1.S525-402-vol.adv` fresh, change nothing, confirm the patch shows, select
   the stone, Save As `1.S525-402-vol-base`. Close, reopen `-base` and note whether the patch is still there. Needed
   because any Advisor Save As moves regions by up to 9.7 MB even with no change (E01 notes), so our file against
   Advisor's save cannot show which change matters.
2. On the PC session: compare `1.S525-402-vol-base.adv` with `1.S525-402-vol-advisor.adv` (`tools/adv_cmp.py`), list
   every differing field relative to the stone's marker, write it into `ADVISOR-NOTES.md`.
3. Add those fields to `viewer/write.js` (find each by its old value in every record copy), rebuild 401 and 402
   from Advisor's own files (`advisor-resaves`) with the plans in `output/*.plan.json`, and check in Advisor.

Update 5 Nov: read-only checks weakened most of the candidates below (see the end of `ADVISOR-NOTES.md`). No old stone value is left in `402-vol`; let the base-against-advisor comparison decide.

Candidates for the missing field(s), from the PC session's notes: the **4 unknown fields** in each stone record
(about m-3619..-3587 and m-731..-699; Advisor resets them on every stone change), a **list of coordinates** in the
record (m-2654..-2422, looks like part corners) and one value in the neighbouring stone's record that changes with
it, and the **part records** (box, part weight, part centre). Offsets inside a record are not fixed; find fields by
value.

## How tests were run on the Mac
A local server serves the viewer and the drive (`.claude/launch.json`: "viewer" on port 8765, "saver" on 8766 which
accepts PUT /out/<name> and writes into `autook/work` on the drive). In the page, `openAdv(file)`, `buildAdv(s)`,
`planFor(s)`, `autoPlanRows(s)`, `outsideDepth`, `nearPoints` are available from the console. Building from
Advisor's own files only (original or re-save), never from an already filled file.

## Also pending
- PC notes merged 5 Nov (E01-E08). Any later PC notes still need merging: add only their new lines, do not copy the file over, because the project's notes now end with a Mac-only section. No 402-vol result in them yet.
- Make Save .adv write to a separate folder instead of overwriting (agreement: keep originals). Ask the user first.
- Pie cuts (3 saws meeting) cannot yet be fitted with fixed saws (stone 276).
- Letter of questions for Sarine was drafted (format doc, position reference, girdle measure method, records to
  update, out-of-rough check, stone count).
