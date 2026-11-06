# Advisor 7.61 reverse-engineering notes

Findings from `.adv` files, Advisor's libraries and screenshots. Our code is written from these notes, not copied from Advisor. Licence and dongle files are out of scope.

Status: **confirmed** was checked against Advisor or stored totals. **Likely** fits the evidence but is not proven.

## .adv file format

All values are little-endian. There is no documented layout, so items are found by signature.

| Item | How to find it | Status |
|---|---|---|
| File signature | First 16 bytes `ca9b28c7d7ec9b45aabfe4423fef0eff` | Confirmed on 5 files |
| Save time | Windows FILETIME at offset 60 | Likely |
| Rough and polished weight | Doubles at offsets 68 and 76 | Confirmed |
| Summary fields | Length-prefixed strings near the end of the file (`stone.RoughWeight`, `Result.1.PartWeight`) | Confirmed |
| Mesh | Tag `95f2b28927963b48a7a200cba02f27ab`, then version, size, vertex count, xyz doubles, face count, faces | Confirmed, some blocks damaged |
| Inclusion | Name `IncN - (3D)`; real pieces come first, then merged copies | Confirmed by mesh counts (91-99%) |
| Inclusion state | Byte at name end + 47: 0 ignored, 1 used, 2 auto | Confirmed by stored totals (one off on 105) |
| Inclusion type | Byte after `SawID` + 9, values 0-9 | Meaning unknown |
| Plan placement | Pair of -12345 markers; diameter at marker - 92 | Confirmed on 5 stones |
| Placement rotation | Three angles at diameter - 56: R = Rz(c) Rx(b) Rz(a) | Confirmed on 104 |
| Proportions | See Round cut below | Confirmed on 104 |

## Round cut

`ShapesDlls64` holds 58 shape plug-ins, 7 of them named `*AsymShape`. The ones checked export a similar interface (`CreateProps`, `CreatePropsLim`, `CreateSynShape`); `RoundAsymShape64.dll` also exports `CreateAsymCalc`.

Proportion block fields, by index of 8-byte doubles, in the order the round plug-in names them:

| Index | Field | Status |
|---|---|---|
| 0 | Girdle height | Confirmed |
| 1 | Table size | Confirmed |
| 2, 3 | Crown and pavilion angle, radians | Confirmed |
| 4, 5, 6 | Crown, pavilion and total height | Confirmed |
| 7-14 | Swindle, culet and off-centre values, zero on these stones | Likely |
| 15, 16 | Crown and pavilion halves height ratio | Confirmed |
| 17, 18 | Crown star ratio, pavilion halves ratio | Confirmed |
| 19 | Length to width ratio | Likely |
| 20 | Sides, 8 | Likely |
| 21 | Crown plus pavilion angle | Confirmed |

The stone's own block is 248 bytes from its placement record. Blocks further away are the grading system's Actual Minimum and Actual Maximum limits, such as MARUTI, ROUND, V.G.; they use the same layout.

Facet rules (D diameter, R = D/2, table corner radius rt = table * R, c = cos 22.5):

- Star tip radius: rs = rt c + (R - rt c) * star
- Star tip depth below the girdle top: crown * D * (R - rs c) / (R - rt)
- Lower-half tip radius: R * (1 - half)
- Lower-half tip height ratio on the pavilion: 1 - (1 - half) * c

The last two ratios reproduce the stored index 15 and 16 values. Upper and lower girdle facets are flat planes through a tip and two neighbouring girdle touch points, spaced 22.5 degrees apart. Between those points the planes cut into the round girdle, so the rim is wavy.

With every facet flat, the model is 100.34% of Advisor's stored weight on four stones, within 0.003%. Using a density of 3.508 instead of 3.52 removes the difference. That value is measured from these stones, not read from Advisor. Stone 105 has no block at the 248-byte position, so its stones use assumed values.

The file header holds exact weights: part weights from offset 88 and polished weights from offset 104, 8 bytes each, with -1 for unused slots on stone 102.

## Grading systems

Advisor's grading screen is organised as grading system, then shape, then cut grade. Listed systems include AGSL, IIDGR, MARUTI and O BAR. Each row has a user minimum and maximum, plus an actual range that Advisor narrows.

The actual range follows from three relations, checked on MARUTI, ROUND, V.G.:

- crown height = tan(crown angle) * (1 - table) / 2
- pavilion depth = tan(pavilion angle) / 2
- total depth = girdle + crown height + pavilion depth

| Field | User range | Actual range | Result |
|---|---|---|---|
| Table | 58-62 | 58-60.809 | Maximum from crown 14.5 and angle 36.5 |
| Crown angle | 34.5-36.5 | 34.624-36.5 | Minimum from table 58 and crown 14.5 |
| Crown height | 14.5-16 | 14.5-15.539 | Maximum from table 58 and angle 36.5 |
| Pavilion angle | 41.1-41.7 | 41.1-41.348 | Maximum from depth 44 |
| Pavilion depth | 42.5-44 | 43.618-44 | Minimum from angle 41.1 |
| Total depth | 60-64 | 61.118-63.039 | Sum of the actual values |

These limits are the allowed search range for an automatic planner. The MARUTI values match the two limit blocks stored in the `.adv` files.

## Scan frames

- 300 JPEG frames of 1024 x 1280, one full turn at 1.2 degrees per frame.
- Advisor shows them flipped vertically.
- A few frames contain a block of other image data. The cause is unknown; out-of-order storage blocks are one idea.

## Model to frame formula

Find the double 3*pi/2 whose next double is 2*pi/300 larger, at offset h.

- Rotation R (3 x 3, by rows) at h - 84, offset T at h - 108
- Span (7900) at h - 444, image width (-6320.128) at h - 412

With q = R p + T: a = -q1, b = q0, c = q2 + span.

For frame i: th = i * 2 pi / 300, u = 512 + K (a cos th + b sin th), v = K c, K = 1024 / 6320.128.

Checked against Advisor on 104 at frames 49, 123 and 161 with the offset fitted; the stored offset agrees within about 7 um.
The other four stones were checked by eye only.

## Program map

| Area | Files | Purpose | Status |
|---|---|---|---|
| Main program | `Advisor.exe` (57 MB, native C++, names removed) | Application and likely the planner | Likely |
| Cut shapes | `ShapesDlls64` (one plug-in per cut), `ShapesDynamicLoader64.dll` | Facet geometry and proportions | Confirmed from exported names |
| Light performance | `OpticaCUDA64.dll`, `RayTracerCuda`, `optix` | GPU ray tracing | Likely |
| Rough tracing | `RoughTraceCUDA`, `GDelFlipping64.dll`, `PCLLib64.dll` | GPU geometry from scans | Likely |
| Image processing | `FindOutLine64.dll`, `ImageSegmentation64.dll`, `LineDetect64.dll` | Outline and inclusion detection | Likely |
| Hardware | `Camera64.dll`, Basler wrappers, `RS232ComDll64.dll`, `HardwareLaserMarking64.dll` | Scanner, camera, laser marker | Likely |
| Pricing | `PricingEditorOld64.dll`, `Extra Files/Pricing` | Price lists | Likely |
| Reports | `ReportEditor`, `Extra Files/Views`, `Extra Files/Labels` | Screens, reports and labels (XML) | Confirmed from files |
| Remote work | `SarinGridAgent`, `Sarine.RemoteProcess.*` | Remote processing | Likely |

## Open questions

1. Why Advisor's panels list the 37 degree tilt under blue while the calculated tilted stone is drawn red.
2. What inclusion types 0-9 mean, and Advisor's red shapes.
3. Meaning of `GIANEW` and the plan record fields not yet decoded.
4. How the automatic planner chooses cuts. It is expected to be the hardest part to recover from compiled code.

## .NET libraries

Sarine's .NET libraries have readable names, so they are not obfuscated by name. Findings so far come from metadata only: class, property and text names. No method code has been decompiled yet.

| Library | What it shows |
|---|---|
| `ResultsSolutionsUserControl.dll` | The results list is built from `ResultsSolutionsVM`, `ResultSolutionVM`, `ResultVM` and `SawVM`, with Weight, PartWeight, PartYield, Color, Grade, Price, PriceDiscount, TotalPrice, TotalWeight, IsCurrent and a price list command |
| `ResultGroupFilterUserControl.dll` | Solutions can be filtered by shape, weight, clarity and price, and by inclusion types (black, white, cloud) and locations (table, culet, girdle) |
| `Sarin.FileAccess.dll` | Log file handling and zip tools; no stone data found by name |

`NativeResultsSolutionsUserControl64.dll` and similar `Native*` files are mixed C++/CLI bridges between the C++ program and these screens.

Each result carries its own price fields, so Advisor's built-in pricing may be able to show value per stone. This is not tested.

`Sarine.RemoteProcess.Interfaces.dll` deals with machine fingerprints and licensing, so it is out of scope.

## Decompiling progress

- `ResultsSolutionsUserControl.dll` and `ResultGroupFilterUserControl.dll` decompiled with ilspycmd. They are display layers: weight and price arrive as ready-made text from the C++ side, so no price or planning logic is here.
- `RoundAsymShape64.dll` analysed with Ghidra: 3,218 functions decompiled, mostly without meaningful names.
- Searching the round plug-in and `Advisor.exe` for the density found no 3.508 constant.

## Price list search (1 Nov 2026)

`Extra Files/Pricing/Import Export.xls` is the only price file in the Advisor folder. It is a sample import layout, not real prices: values are 1 to 36 and 100 to 300, made by multiplying a colour step by a clarity step, for 0.01-6.99 ct and 7-7.99 ct. It does show the layout Advisor imports: grade, clarity, colour, weight from, weight to, price, with an empty Discount section. Stone `1.S525-1.adv` holds no price fields by name.

## Saw plate

The viewer and planner default to a 25 micrometre plate, as set by the user. These five `.adv` files store 35 micrometres in their plans.

## Saving .adv files

`Save .adv` overwrites the stone's file in the chosen Stone folder, at the same length, as the user asked on 1 November 2026. No backup is kept, also by the user's choice. A plan with a different stone count is not written into the `.adv`; it goes to `[Stone Name].plan.json` beside the stone. It updates inclusion state bytes, identical copies of each placement and proportion record, the header weights and, for two stones, the saw plane. Text summary fields and other records are not updated. Not yet tested in Advisor.

`.adv` files store one state per inclusion, so split inclusions cannot be written exactly. A split inclusion stays used in the new `.adv` if either part is selected. The exact split is kept in the plan file and the browser.

## Viewer editing tools

- Edit saw: left-drag turns the saw about its pivot, right-drag moves it along its normal, and release refits the stones on each side. Stones are fitted to the saw as placed.
- Split inclusion: a line drawn on screen becomes a plane through the view, and every mesh of the inclusion is cut exactly along it. The cut face is not capped.
- One stone view: clicking a polished stone, or its name in the details, hides the rough, saw and other stones. Tab shows inclusions cut exactly to that stone's facets.
- Safety distance: selected inclusions may sit this far inside the surface, because polishing removes that layer. The fitter tests against a shrunken stone, default 10 um, set under Cut limits. Saved in the plan file; `.adv` files have no field we know of for it.
- Auto select: starting picks ignore Advisor's ignored inclusions, inclusions smaller than 50 um, and pin marks. A pin mark reaches within 6% of the stone's height from the scan top or bottom and stays within the end 25%. Both limits are set under Cut limits; the 25% is fixed. Saved manual picks win over auto picks.
- Darkness is unsolved. The inclusion type byte (found for only some inclusions) showed no pattern with size or scan brightness, and scan brightness mostly follows position in the image. Advisor's black, white and cloud filters suggest the data exists somewhere.
- User correction: black pieces were being ignored. Big pieces (388-584 um on 104) reached the stone ends and were taken for pin marks, but they run into selected inclusions. Auto select now keeps any ignored piece of 30 um or more with 5 or more corners within about 20-40 um of a selected one, one pass only.
- Scan darkness tested over 60 frames, comparing each inclusion with its bright surroundings. It does not separate black from light: most ignored inclusions score as dark, and the bright holder inflates pieces near the ends. Requiring darkness from most angles leaves 0-6 pieces per stone of 30 um or more, not confirmed, so it is not used.

## Auto plan

Tries 1 to 5 stones in parallel and keeps the highest total profit. Stones that cannot pay for labour are dropped. Keys 1 to 5 still fit by weight.

- Rates as set by the user: 22,320 per carat up to 1.25 mm, 14,415 above, 60 labour per polished stone, 3% weight lost in polishing (changed from 5% on 1 Nov 2026; profit figures in these notes dated before that used 5%).
- Planned diameter = size in the plan. Final weight = planned x 0.97. Final diameter = planned x cube root of 0.97. Price band follows the final diameter.
- Planned sizes showing 1.26 to 1.33 mm are blocked for safety, so a stone is held at 1.254 mm or must reach 1.335 mm. Rates and blocked sizes are set under Cut limits.
- The fitter outline now passes through the real star and lower-half tips, which sit up to about 10 um outside a straight cone. Before this, selected inclusions could sit up to 19 um deep with a 10 um safety, and tips could leave the rough. Fits take about three times longer.
- Save new .adv writes stones and saw only when the stone count matches Advisor's plan; otherwise only inclusion states change.

## Bulk data CSV

`ExportSettings.xml` sets After Save, Selected Results, Overwrite, file `[Stone.Name].csv`, template `Laxmi_Galaxy_Sarin.txt` (not supplied), output `\\server\GalaxyImport\Galaxy\16\`.

52 columns, 60 data rows, CRLF. Unused rows keep the stone columns and Fls = None; rows 10 to 60 repeat the first saw weight under SawWeightCarat when the stone has a saw.

- mm columns = percentage x diameter. Checked on 10 stone rows: 189 of 210 values identical, the rest rounding only, because the test started from rounded values.
- SW(%) = saw loss / rough weight, SW(MM) = saw width in um. Fits the samples within rounding.
- Pw = planned polished weight. WT = rough piece; on 104 we get 0.026 and 0.034 against stored 0.026 and 0.033.
- The template puts WeightAfterBrout in Culet(%) and CuletSize_% in Culet(MM).
- Template `Laxmi_Galaxy_Sarin.txt` confirms: PartName = part number of that result; PartWT = weight of part i in the part list; UserName, SW(%), SW(MM) and SawWeightCarat = saw i in the saw list, unrelated to the stone on the row; saw and SawName = the saw this result came from. Rows from 10 down all point at saw 1, a quirk of the template. Fls = user property 3, GradingInstitute = RemapAccuracy.
- Tilt = angle between the stone's axis (towards the culet) and the saw normal pointing to the stone's side, or the z axis when there is no saw. Checked on 104 only: 0 and 36.8 against Advisor's 0 and 37.
- Charni comes from `SieveSize.xml`, 36 groups up to 4.40 mm, looked up on the diameter rounded to 2 decimals. Matches all 10 sample rows. Sizes above 4.40 mm stay empty.
- Pair test on 1.S525-106: the `.adv` header says saved 30 Oct with a 1.30 mm plan; the CSV shows 1.73 mm, which is not in the file, so the CSV came from a later save. The pair cannot prove stage weights. It does show Stone.color D and Stone.clarity IF match the CSV, and Rough Length and Height match the x and z sizes of the 320 point outline.
- Viewer bug found on 106: real vertices very close to zero were counted as damage, which threw out good meshes. Fixed; inclusions on 101 to 105 also went up to the full count. Fallback outline is now chosen by volume against rough weight, preferring more detail.

## Stage weights

Checked on 1.S525-106 only, with `.adv` and CSV from the same save, using the coarse 636 triangle outline. All other columns matched Advisor exactly, except LaserCuttingDepth (not decoded).

| Column | Rough kept | Advisor | Ours |
|---|---|---|---|
| WeightAfterTable, WeightAfterSaw | below the table plane | 0.040 | 0.038 scaled, 0.043 raw |
| WeightAfterBruting, Culet(%) | table and girdle cylinder | 0.022 | 0.0223 |
| WeightAfterCrown | bruted and crown cone | 0.020 | 0.0205 |
| WeightAfterConing | crown shape and culet plane | 0.017 | 0.0170 |
| WeightAfterPavil | bruted and pavilion cone | 0.010 | 0.0102 |
| TableSurfaceDist | rough past the table, whole rough | 0.40 | 0.39 |

LaserCuttingDepth 2.1 does not match the axis span 1.69, table chord 2.26, width across the axis 2.41 or box diagonal 3.74. One stone proves little, and none of this has been tested with saws.

Summary entries near the file's end: name, unit, marker `bdf96b8de22c8c448fb482e2e32824d8`, then count 1, size, type, rounded integer, double, text length, text. Type 2 is a value; type 3 with size 0x18 is an empty entry, 8 bytes shorter with no text, so an unused Result.N cannot be filled in place.

Different stone counts: each saw part has its own block of about 2.8 MB (104 and 103 records 2.79 MB apart), while stones in one part sit about 3 KB apart (101). Adding a stone would need new blocks, a new part and resized entries. To decode this we need two saves of one rough with different stone counts.

## Inclusion list

Taken back out of the viewer at the user's request (1 Nov 2026), until planned stones show what can stay inside a stone. The last viewer with it is in `backups/2026-11-01-unprocessed`.

From a table in another auto planning program the user bought, read from a photo, so some values may be misread (0.09 looks low). Editable under Cut limits.

- Size = rough weight in carats. A rough between sizes uses the row below it.
- Plate = saw thickness. MIN-MICR = smallest inclusion that counts. D-TOP-S and D-BOT-S = drop pin zone in um. All three are in use.
- Fitting zones, as answered by the user: Table centre is under the whole table, Crown is the rest above the girdle, Tik is everything from the girdle down (pavilion). A selected inclusion may stay in the stone if its size is within that limit. Size = box diagonal of the whole inclusion, in um.
- DISTANCE = the polished stone must stay this far inside the rough's outer surface, applied by shrinking the 30 um voxel mask, so it is accurate to about one voxel. It is not applied at saw cuts.

## Unprocessed stones

Files like `44.518-80x.adv` have no plan (polished weight -1, no summary fields) and hold their shapes in about 235 deflate sections (zip local headers named `ZippedData`). Some sections have spare bytes after the data, which the browser's DecompressionStream rejects, so the viewer has its own inflate. One section in 801 is damaged, losing one inclusion.

- Rough: the third mesh tag in the first section, the usual layout, with junk in the top 16 bits of the point count. Weights match: 0.0211 for 0.021, 0.0261 for 0.026, 0.0274 for 0.027.
- Inclusion section: name, state at name end + 47, then at name end + 47: 1, 1, inclusion number, four zeros, piece count. Each piece: point count, points, face count, polygons. Merged copies follow and are not read.
- Inclusion states sit inside compressed data and these files have no plan record, so Save .adv does not change the file. The plan goes to `[Stone Name].plan.json` and the CSV.

Auto select order, changed 1 Nov 2026: drop pin marks always stay ignored; the joined rule applies only to pieces ignored for being small or by Advisor. A pin mark is an inclusion reaching within 6% of the height from the scan top or bottom and staying within the end 25%.

## What Advisor's video and files show (1 Nov 2026)

Video of an operator working in Advisor, stones 44.518-957 and 44.518-964.

- Inclusion Mode can be Ignore, Use, Auto, Partial, Hidden or Full. Correction from the user: these clicks are made by a separate auto planning program wrapped around Advisor, not a person. It presses Select, filters inclusions, sets their mode, then End Select. The list also has an Auto Clarity button.
- Inclusion clarity is stored at name end + 42 (the old "type" byte): 0 IF, 1 VVS1, 2 VVS2, 3 VS1, 4 VS2, 5 SI1, 6 SI2, 7 SI3, 8 I1, 9 I2, 255 not graded. Unprocessed files are all 255.
- Clarity is set by size. From 1,247 inclusions on 3 files, median diagonal in um: IF 19, VVS1 67, VVS2 101, VS1 110, VS2 122, SI1 218, SI2 406, SI3 515, I1 607, I2 732. Bands barely overlap, apart from SI1.
- Ignoring does not follow size or clarity closely: 50% of IF ignored, 43% of VVS1, 17% of SI1, 7% of SI2. Large ignored ones are few.
- Advisor's stones do hold used inclusions. On 101 and 104 stones hold 1 to 5 used inclusions, some 71 to 120 um deep, graded up to SI3 and I1 as whole inclusions. Stone 106 at 1.30 mm holds none and its CSV clarity is IF. The stone clarity on 104 (VS2 and SI1 in an earlier screenshot) is better than the whole inclusion grade, so probably only the part inside counts. Not proven.
- Saw width varies by stone in the video: 20 um on a 0.016 ct rough, 25 um on a 0.028 ct rough.
- Planning tools shown: Makeable, Best+top, Both, Best twin, Best Pair, Multiplan Pair, Sawless, Best Remainder. The run is Fast mode with Multiplan RoughSkin steps.

Allowed inclusions: Auto plan may leave selected inclusions up to a set size inside a stone (default 130 um, whole inclusion box diagonal, under Cut limits). Auto plan on 1 Nov 2026, limit 0 then 130: 106 1.83 to 1.82 mm, 802 1.04 to 1.05 mm, 803 1.16 to 1.25 mm (Rs 68 to 102, 6 inclusions inside, largest 98 um), 801 no plan either way. With 500 um, 802 reached 1.24 mm, Rs 96. Differences of 0.01 mm are search noise.

User's rule from a picture: inclusions that are faint grey in the scan can be ignored if needed, solid black ones cannot. Darkness is not automated yet. Earlier tests were not able to separate them; labelled examples with stone name and frame are needed.

## Auto select recipe (from the user and the video, 1 Nov 2026)

Replaces all earlier guessed selection rules, including the joined rule, the 50 um rule and reading Advisor's ignored states.

1. Every inclusion starts as Use.
2. Filter size 0 to 201 um, set to Ignore.
3. Filter size 152 to 230 um, set to Auto. Inclusion Details for Auto: Girdle/Crown 0, Table 1, Culet 1 (defaults shown were 0, -1, -2), applied to all and saved to the template.
4. Select by distance 100, set back to Use (corrected below).
5. Plan.

The filter window also has Clarity, State, Group (None, Cloud, Crack, Crystal, Needle, PinPoint, Cavity, Surface, Feather, Knot, White; Cloud was unticked), Distance From Surface and Distance From Polish. Mode options: Ignore, Use, Auto, Partial, Hidden, Full.

In the viewer: Use is green, Auto yellow, Ignore red. An inclusion counts as in the skin only if all of it is within 100 um of the rough surface (assumed; Advisor's exact distance measure is not known). Auto inclusions may stay anywhere inside a stone, and Inclusion Details values are not used because their meaning is not known. Drop pin marks stay ignored. Group filters are not used because groups are not decoded.

## Recipe measured on 2.S526 (1 Nov 2026)

85 of the 100 `.adv` files in `2.S526` were overwritten by our Bulk plan, so their states are not Advisor's. 15 were untouched (file date 31 Oct, no CSV in `export`): 418 427 430 435 440 442 449 455 463 468 475 476 492 498 500. 440 and 449 give no inclusions to score (440 is zipped, its outline has 63 bad points and no inclusion sections were found).

- Step 4 corrected: within 100 um of the surface goes back to USE, not Ignore. On 427, 435 and 455, 3,830 inclusions: the change is sharp at 100 um when measured to the deepest point of the inclusion.
- Advisor's size is the longest side of the inclusion's box, not the box diagonal. Auto inclusions run 151 to 255 um by that measure.
- Viewer score against saved states: 427 94%, 435 88%, 455 98%, 468 91%, 475 88%, 476 88%, 418 85%, 463 81%, 500 73%, 492 72%, 498 71%, 442 69%, 430 58%. Total 5,113 of 6,198, 82%. Low scores are on stones with the coarse outline or few ignored inclusions.
- Drop pin marks: Advisor has no separate rule. Of 68 inclusions touching the end 6% on the three best stones, 37 are Use. The viewer still ignores them because the user asked for it, which costs a little match.
- Rough outline is now always chosen by weight. Before, a small damaged-outline piece over 800 points could be taken as the rough (418 used a 0.0001 ct piece).

## 200 reference stones (`/Volumes/MY BOOK/autook`, 201-300 and 401-500)

True Advisor saves from 30 and 31 Oct, never touched by us. 198 readable; 205 and 494 give no usable rough.

- Auto select against saved states: 90,424 of 104,056 inclusions, 87%. Typical stone 89%, range 60% to 97%. Ignore 87%, Use 87%, Auto 68%. Stones on the coarse outline score 80%.
- Advisor's plans: 429 polished stones (33 roughs give 1, 93 give 2, 70 give 3), total profit Rs 25,295 at our rates.
- This corrects an earlier note. Advisor keeps Use inclusions out of the stone. Of 370 kept inclusions more than 10 um inside a stone, 188 are Auto. Use ones have median depth about 10 um, so the 10 um safety is right, and those over 400 um are all skim. Auto ones reach about 160 um.
- Bulk compare on 10 stones with Advisor's saved inclusions: Rs 1,669 before, Rs 1,523 after, 4 better (one by under a rupee), 6 worse. Best of both on each stone would be Rs 1,748. Ours loses mostly where Advisor has 3 stones, so the search for 3 stones is the weak point.

## AutoPlaning.exe (the user's automation program, 1 Nov 2026)

`/Volumes/MY BOOK/auto/AutoPlaning.exe`, 16 MB, 64-bit Windows, C++ with MFC, internal name SCAN.exe, version 1.0.0.1, dated 20 Oct. Not .NET. It calls the dongle runtime (`hasp_rt.exe`), so it checks a HASP dongle. `AutoPlaning.rar` was copied on the Windows PC but did not arrive on the Mac. Only its readable screen text was read. Its logic was not read, and the dongle protection was not touched.

- It drives Advisor's own plans (Makeable, Best Pair, Best Twin, Sawless, Triplate, Fancy, plans 1 to 6), then picks the best by weight or value. Options: Value and Weight 1 max weight, 2 max weight plus value; Speed 1 fast to 4 most accurate; Weight Lost (%); Charni; Labour Price; Rough Price; Clarity grade settings.
- Inclusion modes: Dop 0 ignore, 2 auto, 3 partial, 4 hide, 5 full. Settings: Table (um), Tik (um), Plate Size (um), Safety (um), Crown Safety, R-Skin, Skin Degrees, Remove Safety Surface, Preview (um), Filter Technique, Select by Size, Select by Distance.
- Label: "TABLE -1 AND TIK -2 = DEFAULT, TABLE 1 AND TIK 1 = NO INCLUSION IN TABLE TO TIK". Matches the Inclusion Details values the recipe sets for Auto (Girdle/Crown 0, Table 1, Culet 1).
- The rule table the user showed is the program's own INCLUSION LIST grid, saved with its SAVE button. It is data, not code, so it will be in a file or on the server. Not found yet. Next step on the Windows PC: press SAVE and list files changed in the last 3 minutes.

## Where Auto inclusions sit in Advisor's stones (196 untouched stones, 429 polished stones)

- 155 of 196 roughs have Auto inclusions. 188 Auto inclusions sit more than 10 um inside a stone. 96 of these touch the column straight down from the table (radius = table radius). 65 are only in the crown ring and 27 only in the pavilion ring. None reach the tip. Depth inside: median 49 um, 90th percentile 142 um; in the column median 70, 90th 173.
- Use inclusions: 180 inside, all within 10 um of the surface (median depth 10 um).
- So Advisor's saved stones do hold Auto inclusions under the table, against the label above. The user said the column cannot hold Auto inclusions ("ig", unsure). Either those stones were planned with Table -1 and Tik -2, or the label means something else.
- Test, 10 stones from 201-300 with Advisor's saved inclusions: Advisor Rs 1,736; Auto plan with Auto allowed under the table Rs 1,575; with Auto blocked under the table Rs 1,474. Allowed is the default (Cut limits, 'Keep Auto inclusions out of the column under the table', 0). The Rs 1,736 here differs from the Rs 1,669 reported earlier for the same stones. Not explained.

## Comparison with autook (partial, 1 Nov 2026)

Run at 3% loss, each stone planned twice: with Advisor's saved inclusions and with Auto select. Stopped after 25 of 200 stones when the drive disconnected; 201 to 225, 24 readable (205 has no rough, 213 has no plan). Results and scripts are in `comparison/`.

- Inclusions: 7,348 of 8,385 match, 87.6%. Ignore 87%, Use 89%, Auto 62% (only 74 Auto inclusions).
- Plans with saved inclusions: Advisor Rs 3,752, ours Rs 3,380. Better on 6, worse on 16, level on 2.
- Polished weight: Advisor 0.413 ct, ours 0.314 ct, 24% less. Stones: Advisor 57, ours 42. Same stone count on 9 of 24.
- Where Advisor has 3 stones (13 roughs): Rs 2,611 against Rs 2,302; ours has 3 stones on only 3 of them.
- With Auto select our plans earned more than with saved inclusions (Rs 3,519). It leaves more inclusions free, so this is not proof it is better.
- Pattern seen, cause not proven: ours often keeps one big stone or holds stones at 1.25 mm, and asking for 3 stones often returns fewer.
- Speed: 25 stones took about 34 minutes.

## Advisor settings files and the auto program's own results (2 Nov 2026)

Copied from the Windows PC to `/Volumes/MY BOOK/auto-files`: Advisor's `UserFiles\Inclusions` tables, `Weight.ini`, and 7,126 `SaveResult\*.ini` files (672 1.S525, 702 2.S526, 4,684 44.518, 1,068 44.AA517). `RUNSTONE\*.run` are empty. The program's own table is not in the registry (key not found).

- `InclusionsAutoClarities.xml`: inclusion clarity by size (um), ID 0 to 10 = IF, VVS1, VVS2, VS1, VS2, SI1, SI2, SI3, I1, I2, I3: 0-50, 51-90, 91-100, 101-110, 111-120, 121-350, 351-450, 451-550, 551-650, 651-750, 751-850. Matches the measured medians. Three further tables for Cloud (VisualDescription 1) and Crack and White (2): 1-5, 6-12, 13-26, 27-65, 66-130, 131-219, 220-338, 339-507, 508-1000, 1001-1500, 1501+.
- `InclusionSafteyDistances.xml`: 0, 20, 25, 50, 150, 200, 300, -5, -10, -15, -20, -100. `InclusionPolishVicinity.xml`: 50 to 300, current 150 um. `InclusionGroupNames.xml`: None, Cloud, Crack, Crystal, Needle, PinPoint, Cavity, Surface, Feather, Knot, White.
- Each `SaveResult` file lists the program's settings for one stone and every plan it tried. Settings: `Sefty=-10` (always), `Plate=0`, `TikIgnInc=201` (always), `CrownInc`, `TableInc`, `chId`, `StoneWeight` (rough ct), `FilterNumber=1`, `TimeOut=20`.
- `chId = floor(rough ct x 100)`, the 0-based row of the user's INCLUSION LIST (row index 2 is labelled 0.03). Verified on all chIds seen: `CrownInc` = CROWN+ of that row minus 30; `TableInc` = TABLE CTR+ plus 1; `TikIgnInc` = TIK-IGNORE+ plus 1. So rough 0.027 ct uses the row labelled 0.03. The user's "row below" was off by one. 44.518 stones show `CrownInc` -30 for 1,565 of 4,684, a template with no crown value, and they are not in the reference set.
- The video stone (0.027 ct) shows Auto filter 152 to 230 = row CROWN+ 260 minus 30. So the Auto size range is 152 to CrownInc of the row, not a fixed 230. Rough under 0.02 ct has CrownInc 70, below 152, so no Auto inclusions at all.
- Sefty -10 matches our 10 um safety, and means an inclusion may sit 10 um inside the stone.
- The winning plan has the highest polished weight: SAVE-WEIGHT equals the best candidate weight in 1,378 of 1,489 checks. Prices are 0, so it does not use profit.

## User's answers about Auto (2 Nov 2026)

- Distance for Select by Distance is measured through the rough surface.
- Auto inclusions cannot be in the table and culet parts; they can be elsewhere (girdle, crown). The user is almost certain. This matches the program's label "TABLE 1 AND TIK 1 = NO INCLUSION IN TABLE TO TIK" and the Inclusion Details values 0, 1, 1. The viewer now keeps Auto inclusions out of the column straight down from the table by default (Cut limits setting, 1 = out). Use blocks everywhere (10 um safety), Ignore blocks nowhere.
- Evidence against: 96 of 188 Auto inclusions inside Advisor's saved stones touch that column (none reach the tip). Either those stones used other Inclusion Details values or the table region is narrower than the whole column. On 10 stones with Advisor's inclusions: Advisor Rs 1,736, Auto allowed Rs 1,575, Auto blocked Rs 1,474.
- The Inclusion Details values are not stored per inclusion: bytes 33 to 74 of the 4,094 inclusion records checked are identical apart from clarity (offset 42), state (47) and a count (75). They are probably in a template file ("save changes to the current template?"). Ask the user to copy Advisor's `UserFiles` XML files.
- The company has no rough above 0.30 ct. The user does not know what the program's templates are.

Auto rule changed again on 2 Nov 2026 at the user's request: not the whole column to the culet, only two parts. Table part = under the table (radius up to the table radius), from the table down to the bottom of the girdle. Culet part = the lowest 30% of the pavilion depth. Auto inclusions block a stone there like Use ones and are allowed everywhere else. The user confirmed "the whole table and the bottom tip". Settings in Cut limits: keep out of table part (1), keep out of culet part (1), culet part percent (30). Test on 2.S526-427 with every inclusion set to Auto, 1 stone: none 1.276 mm with 21 Auto inclusions in the table part and 5 in the culet part; table only 0.985 mm, 0 in table; culet only 1.142 mm, 0 in culet; both 0.965 mm, 0 in either. On real picks the three stones tested (427, 435, 455) had almost no Auto inclusions inside, so the rule changes little there. The earlier note about a whole-column setting is replaced by this one.

## Depths of the table and culet parts (2 Nov 2026)

The user says the only thing left to match is how deep the table and culet parts reach. The viewer now has two settings in Cut limits: table part reaches down to X% of the stone height (0 table, 100 culet), default 50; culet part starts at Y% of the stone height, default 60. The table part is the area under the whole table (radius up to the table radius). Both only block Auto inclusions.

First estimate from the stones stored on the Mac (14 stones, 32 polished stones, only 8 Auto inclusions more than 10 um inside a stone): their positions are 1% to 51% of the stone height, none lower. Six of the 8 are outside the table radius (1.14 to 1.68 times it), one is at 0.99, and two near the table plane are only 12 to 17 um deep, so they are skim. This is too small a sample. The 200 stones on `/Volumes/MY BOOK/autook` hold 188 Auto inclusions inside stones; to set the depths properly, measure each one's height fraction and radius fraction and take the table depth as the smallest height fraction at which Auto appears with radius under the table radius, and the culet start as the largest height fraction of any Auto inclusion. Needs the drive.

Test on 2.S526-427 with every inclusion Auto, 1 stone: no blocking 1.276 mm; depths 30/79 gives 0.965 mm, depths 50/60 gives 0.931 mm; no Auto inside either blocked part in both.

## Where Auto inclusions sit in the 200 Auto-planned stones (2 Nov 2026)

Measured on `/Volumes/MY BOOK/autook` (196 readable, 429 polished stones). 188 Auto inclusions have a part more than 10 um inside a polished stone. Height is 0 at the table plane and 100% at the culet; table width = radius up to the table radius.

- Culet: no Auto inclusion reaches below 79% of the stone height. Lowest point: median 27%, 90th percentile 56%, 99th 76%, maximum 79% (counting parts more than 10 um inside); maximum 75% (over 25 um) and 69% (over 50 um). The culet part therefore starts at about 78%, which is the lowest 22% of the stone, not 40%.
- Table: 96 of 188 Auto inclusions touch the table width; 59 of 94 do when only the part more than 50 um inside counts. Of those 59, the highest point under the table width is at 5% (5th percentile), 8% (25th), 11% (median), 38% (75th) of the height. So Advisor's stones do hold Auto inclusions right under the table. The only table limit consistent with them is a very thin layer, about the top 5% (50 to 60 um). The user is almost certain Auto inclusions are not allowed in the table; these stones disagree, so the viewer's table part is off by default (Cut limits, 'Keep Auto inclusions out of the table part'); depth 5%.
- Counting parts only 10 to 25 um inside is unreliable: 46 inclusions have such parts just under the table plane, which is skin from an inclusion crossing the facet, within the 10 um safety plus placement error.
- Possible link: the three Inclusion Details values 0, 1, 1 may index `InclusionSafteyDistances.xml` (0 = 0 um, 1 = 20 um, ... 7 to 11 = negative). That would give Girdle/Crown 0 um, Table 20 um, Culet 20 um, and the default -1, -2 would be unused. Not proven; the real template file is still missing.

Profit test on 10 stones from autook (201-300, Advisor's saved inclusions), Advisor Rs 1,736 at our rates, 3.9 minutes each:
- Auto allowed everywhere: Rs 1,575
- Culet part from 78%, table part off: Rs 1,538
- Culet part from 78% plus table part 5%: Rs 1,532
- Whole column to the culet blocked: Rs 1,474
Settings move the result by about Rs 40 to 100 in either direction, which is about the run to run noise of the random search. The gap to Advisor stays at about Rs 160 to 200 whatever the Auto zones are, and it sits where Advisor has 3 stones (206, 226, 246, 266, 276). So the Auto zones are not what limits our result; the search for 2 and 3 stone plans is. Also remember the auto program picks the plan with the highest polished weight, not profit.


## Advisor planning sequence (phone video of stone 1.S525-206, 2 Nov 2026)

The auto program does not show where it clicks, but Advisor's own screen shows what it does (video `~/Downloads/IMG_0093.MOV`, 268 s, 3 stone plan).

- 0-70 s: inclusion list. Mode set to Ignore/Use/Auto per inclusion, a question box "Do you wish to modify the state of all the selected inclusions?" with All / Primary / None, and a Select by Size / Distance / Clarity menu.
- 70-250 s: Planning in progress, Part Planning panel set to Fast. The status line at the bottom names the steps in this order: Allocating Multiplan Best Pair, then Allocating Best Remainder, then Allocating Program Best Triplet. Best Triplet takes by far the longest (about 110 s of 180 s).
- The Results list fills with candidate saw planes named Saw13-2, Saw15-1, Saw17-1, Saw19-1, Saw22-1 and Pie22-1, plus Multiplan RoughSkin rows. Each row has polished weight, rough part weight and a flag.
- End result: 3 stones of 0.004, 0.003 and 0.004 ct from a 0.071 ct rough. Saw25-1 tilt 26.2 deg, Saw25-2 tilt 50.4 deg, parts 0.016 / 0.011 / 0.042 ct. Then "Stone was successfully exported".
- The stone info shows "Saw Width 35 mic (1.5%)" while our default is 25 um. Ask the user which is right.
- Toolbar buttons: Makeable, Part A, Part B, Both, Best+top, Flip, Best Pair, Sawless, Multiplan Pair, Best Remainder.
- Idea for our search: Advisor sweeps a fixed set of numbered planes and keeps the best pair, then the best remainder, then runs a dedicated triplet search; our search samples 36 random planes.

## Inclusion selection seen in the video (first minute, stone 1.S525-206, 0.071 ct)

- Select button opens an Inclusion Filter box: Clarity, State (Ignore/Use/Auto/Partial/Hidden/Full), Group (None, Cloud, Crack, Crystal, Needle, PinPoint, Cavity, Surface, Feather, Knot, White), Size from/to, Distance From Surface from/to, Distance From Polish from/to, then "Select Inclusions". Filter at 16 s: state Use, size 0 to 201, surface distance 0 to 9999.
- Mode is then set to Ignore and the box "Do you wish to modify the state of all the selected inclusions? All / Primary / None" is answered All.
- The user read Auto as size 202 to 361 for this stone. 361 = CROWN+ 370 (row 0.07 ct) minus 9. Then Inclusion Details (Girdle/Crown 0, Table 1, Culet 1 per the user) with "Apply reductions to all selected inclusions?" Yes, then "Apply To All Inclusions".
- Menu at 40 s: Select By Shape, Clarity, Group, Size, Distance.
- Test on 195 Advisor stones, inclusion state match with our Auto select: Auto 152-230 fixed 87.6%; 202-230 86.9%; 152 to row CROWN+ minus 30 86.1%; minus 9 84.5%; 202-361 fixed 69.2%. So the fixed 230 upper bound still fits best; the row rule from the photo has not been shown to fit.

## Auto select by rough size, measured on 195 Advisor stones (2 Nov 2026)

Rows 2 to 10 only (0.02 to 0.10 ct); the autook stones have no larger rough. Groups counted once, pin marks and skin ones (within 100 um) left out. Size = longest box side, um.

| Rough row | Ignored: median / 95% / max | Auto: min / 5% / median / 95% / max | Small groups (<=201) ignored |
|---|---|---|---|
| 2 | 27 / 152 / 311 | 154 / 154 / 172 / 206 / 206 (only 7) | 48% |
| 3 | 15 / 126 / 394 | 138 / 141 / 175 / 212 / 219 | 71% |
| 4 | 15 / 115 / 501 | 21 / 139 / 175 / 208 / 234 | 78% |
| 5 | 14 / 109 / 2469 | 109 / 148 / 206 / 278 / 313 | 84% |
| 6 | 15 / 103 / 879 | 113 / 148 / 200 / 276 / 317 | 85% |
| 7 | 14 / 102 / 197 | 142 / 149 / 188 / 298 / 317 | 83% |
| 8 | 22 / 111 / 400 | 139 / 147 / 194 / 235 / 251 | 89% |
| 9 | 13 / 100 / 158 | 149 / 149 / 192 / 210 / 210 | 78% |
| 10 | 10 / 89 / 291 | 138 / 146 / 211 / 291 / 298 | 98% |

- Auto starts near 140-150 um in every row, not at 202. Its upper end rises from about 210 (rows 2 to 4) to about 300-317 (rows 5 to 7), then back to about 210-250 (rows 8 and 9), and about 300 for row 10. This is not the photo's CROWN+ column in any simple form.
- Ignored groups are nearly all 201 um or smaller. The rest of the small groups are Use, probably because of distance rules.
- Skin distance by photo DISTANCE column (50, 75, 100, 105, then 135): fixed 100 matches 87.56%, fixed 135 88.02%, per row table 87.63%, shifted rows 87.12% and 87.87%. The default stays 100 (the user chose not to change it).

## INCLUSION LIST matched to the program's result files (2 Nov 2026)

- chId in every SaveResult ini (7,126 files) is rough ct x 100 rounded down, counted from 0, so 0.071 ct is chId 7, the list's SIZE 0.08 row. SIZE is an upper limit. The size table earlier in these notes is by rough weight, and its list rows are one higher.
- TableInc = TABLE CTR+ + 1 in all 7,126 files. TikIgnInc = 201 in all. CrownInc = CROWN+ - 30 in 5,561; the other 1,565 show -30 (CROWN+ was 0 then). The 198 autook stones are all on the current list. Sefty -10, PlanLimitDora 2, TotalPai 2, PaiLimitDora 3, TimeOut 20 in all; PlusWeightDora 1 in 6,732, 0 in 394.
- The 361 in the video for stone 206 is its TableInc. CrownInc for that stone is 340.
- Rule from the program's designer, passed on by the user: TIK column is Ignore for every size (below 200), CROWN and TABLE CTR set the Auto range by size. The user quoted "3 cent 150 to 360", which does not match the list row (0.03-0.04 ct is TABLE 150, CROWN 260-270). Still to clear up.
- Size measure: the diagonal across the two longest box sides fits far better than the longest side. Ignored 99% stop at about 170-195 (0.05 ct and up, 244 on 0.03 ct). Auto 5% start at 180-198. Auto 95% reach: 0.05 ct 339, 0.06 ct 340, 0.10 ct 350, against CrownInc 340, 340, 350; 0.08 ct 297, 0.09 ct 295 against 290; 0.07 ct 361 against CrownInc 340 and TableInc 361; 0.02-0.04 ct 258, 257, 261 against 230, 240, 250.
- Auto found (free groups, not pin or skin): 864 of 1,092 and 1,525 predicted, against 780 of 1,092 and 1,878 predicted before.
- Viewer now: Ignore to 201, Auto 202 to CrownInc by rough weight, this size. Match on 195 stones 88.68% (was 87.56%), checked with the real code.
- Biggest error left: our pin mark rule. It marks 27,017 inclusions Ignore that Advisor keeps Use (mostly big joined groups). Without the rule the match is 92.16%, but then 8,507 Advisor Ignores near the top and bottom are missed. D-TOP-S and D-BOT-S (80) may be the true rule. Not tested yet.
- Other errors left: 7,525 small Use marked Ignore, 6,485 Ignore inside our skin marked Use, 5,209 Use marked Auto.

## The three size bands, as explained by the user (2 Nov 2026)

- Below TIK-IGNORE (200): Ignore. From TIK-IGNORE to TABLE CTR: may come in the table. From TABLE CTR to CROWN: may come under the crown only. PLATE-SIZE: saw thickness by rough size.
- So the Auto top is the higher of CrownInc and TableInc. This explains 0.07 ct (TableInc 361, CrownInc 340) and the 202-361 seen in the video.
- When TABLE CTR is below TIK-IGNORE (0.02-0.03 ct, TableInc 151), no size can go under the table.
- Check on 188 Auto inclusions left inside Advisor's stones (size = diagonal of two longest sides, part under the table above the girdle): crown band 2 of 11 (18%), table band 36 of 126 (29%), under 201 18 of 32 (56%), over the top 7 of 19 (37%). The direction fits, the crown sample is small. Almost all sit in the top quarter of the stone (median deepest point 19-28% of height).
- Viewer: Auto inclusions above TableInc are blocked in the table column above the girdle.
- 10 stones with Advisor's saved states, saw plate from the list: Rs 1,622 (was 1,586, Advisor 1,736); weight 0.144 ct, heaviest plans 0.151 ct (Advisor 0.191). Most of the rise is on 236, 286, 276; 206 and 226 are lower or flat. Saw plate and the band rule were changed together, so their effects are not separated.

## Stones that opened empty

Stone 1.S525-205 is unprocessed (998 sections). Only one rough outline survives and it has 45 damaged points, so it was rejected and nothing showed. It is now repaired: damaged points take the middle of their neighbours and their faces go back. Volume 4.415 mm3 against 4.432 from the weight. 923 inclusions show. Stones 1.S525-444 and 494 are read correctly but store no inclusion records at all (0 names in 34 and 25 sections). All 198 other files open with a rough. Not yet confirmed that Advisor shows the same for these.

## Testing our size measure against Advisor's filter (stone 1.S525-206, 2 Nov 2026)

- The user set Advisor's Inclusion Filter to Size 195-205. It lists Inc35 and Inc328 (both SI1, Use), plus a "Filter486" row in Hidden mode, probably not an inclusion. The State and Group ticks used are not known.
- `InclusionsAutoClarities.xml` gives exact size bands for clarity and every inclusion stores its clarity, so clarity shows Advisor's size range for each inclusion. Fit on 206 (475 inclusions, within 1 um of the band): diagonal of two longest box sides 441, full box diagonal 434, longest chord 429, longest box side 359, same on scanner axes 431, on the inclusion's own axes up to 439. Our measure is the best tried but not exact.
- None of 18 measures selected exactly Inc35 and Inc328. Inc35 box 102 x 150 x 129: two longest 198, full 223. Inc328 box 115 x 62 x 151: two longest 190, full 200. Ours also selects Inc17, 32 and 144 (17 and 144 are Use, 32 is Ignore).
- Inc35 has 4 pieces, Inc328 has 3. Sizes of single pieces are far below 195, so Advisor measures the whole inclusion.
- Viewer unchanged by this test.

## Filter box for the 195-205 test, and small Use inclusions (2 Nov 2026)

- The filter box used for that test has State Use only and Group all except Cloud (no Clarity ticks). So Inc32, which is Ignore, was correctly left out. Inc17 and 144 are Use, and remain a real difference unless they are Cloud.
- Stone 206, away from the surface, under 175 um: 217 Ignore, 1 Use. The size rule works there.
- Over 196 stones (under 175 um, away from the surface): 30,570 Ignore, 7,298 Use, spread over many stones (94 stones hold 80% of them). 205 and 213 have no plan, so all their states are Use; leave them out of match figures.
- The cause of these small Use inclusions is not known. The user asked to drop the cloud idea (2 Nov 2026), so do not pursue it.

## Do our rules accept Advisor's stones? (2 Nov 2026)

On the 10 test stones (25 Advisor stones), each kept at its exact position and proportions with Advisor's saved states, largest size our rules allow:
- Rules accept 96.6% of Advisor's weight (size cubed). Rough outline alone allows the full size or within about 1 voxel.
- Use inclusions with 10 um safety cost 0-5% of size on 21 of 25 stones; biggest 888 to 838 on 206, 1042 to 1009, 1601 to 1556.
- Culet part and table/crown band changed nothing on any stone.
- Advisor's proportions equal our two cuts, or nearly (table 0.58 or 0.608), so the two fixed cuts are not the limit.
- Advisor's positions shrunk to our rules earn Rs 1,563 and 0.181 ct, against Rs 1,736 and 0.191 ct as saved. Our own search earns Rs 1,673 and 0.155 ct. Per stone (Advisor positions under our rules / ours): 206 28/47, 216 104/112, 226 81/72, 236 102/135, 246 122/91, 256 272/285, 266 230/266, 276 205/165, 286 149/210, 296 270/290. Best of the two: Rs 1,753.
- So our search already earns more on 7 of 10 at the same rules, and is short on 226, 246, 276. The Rs 173 lost by shrinking is the cost of our Use check. Idea, not tested: fits() treats the stone as a round cone between facet tips, so a Use point between facets, outside the real stone, may be blocked. Advisor's Use inclusions measured at most 10 um deep against true facet planes.
- Not tested: whether the saw planes between these stones work with our plate.

## Real facets in the inclusion check, and all saws read (2 Nov 2026)

- fits() now passes a point caught by its round cone to inFacets(), which tests the real facet planes (stonePlanes of brilliant at 1000 um, turned as drawn, spin 0 for our stones) less the safety distance. Safety is as the user says: an inclusion may sit up to 10 um inside the surface, since polishing takes it off.
- Advisor's stones at their exact position, spin included, now keep nearly full size: Rs 1,655 and 0.186 ct (was Rs 1,563, 0.181 ct). Largest loss left is 206, 0.888 to 0.845 mm; not yet explained.
- 10 stones: Rs 1,719 (was 1,673, Advisor 1,736); best-profit weight 0.154 ct, heaviest plans 0.158 ct (Advisor 0.191). Per stone: 206 50, 216 118, 226 90, 236 141, 246 123, 256 284, 266 247, 276 167, 286 207, 296 292. The first 7 ran before the saw change and the last 3 after it; that change does not affect the search. 266 fell from 266.
- Saws: each saw has its own -12345 record, about 2.8 MB apart, and a later saw can appear twice, once from each side. Some files start with a placeholder (normal 0,0,1). parseAdv now reads them all into fileSaws; saw count equals stones less one on all 10 test stones. Only drawing uses them. planFor, CSV and Edit saw still use the first saw, and the parts logic depends on that.
- Our own plans always had all their saws. When a stone is dropped at the end its saw stays in the plan: 276 with count 3 kept 2 stones and 2 saws.

## Advisor's three ways of cutting a rough (2 Nov 2026)

Correction to the note above: the first rule for picking saws took a wrong candidate plane on 266, which ran through a stone.
- Straight saw: the plane has no stone across it.
- Pie cut (Pie22-1 in the video): no saw crosses the whole rough. A third stone sits across the plane, and each saw only runs between its two stones. 53 of 162 multi-stone plans on the autook stones.
- Best+top: one stone sits on another's table and the saw lies along that table plane, so it is not in the side-saw records (266: stone C sits 35 um above stone A's table, the plate width).
- Records also hold placeholders (normal 0,0,1) and candidate planes from other plans. parseAdv reads a saw when it touches a stone on each side; then takes the cleanest plane for a pair still undivided, then tries the table plane. Each saw is drawn only where its two stones are nearest.
- Result on 162 multi-stone plans: 149 have at least stones less one saws. 13 are short (215, 227, 228, 241, 277, 289, 410, 413, 427, 482, 485, 489, 497). Widths equal the list on 252 of 254 saws; the other 2 are 35 against 30 and were not looked into.
- Our search only makes straight saws, so it cannot plan a pie cut or Best+top.

## Reading saws from the stone records (2 Nov 2026, replaces the rules above)

- Each planned stone has its own saw record 32 bytes after its position (normal at q+32, offset q+56, width q+64, marker -12345 at q+92). Stones of one part store a placeholder (normal 0,0,1). Later blocks hold other candidate planes, which caused the wrong and overlapping saws. Files with a pie plan also carry stone.Pie = Pie (28 of the first 149 multi-stone plans).
- Order in parseAdv: stone records; a later record touching both of two undivided stones; the table plane (Best+top); the cleanest later plane within 120 um.
- A saw ends exactly at the saw that keeps it off a stone (stops), and a later saw stays in its part. sawFaces cuts the lines there exactly. The earlier nearest-stone rule was approximate and is gone.
- 162 multi-stone plans: no drawn saw line passes through a stone. 148 have stones less one saws. 14 short: 215, 228, 241, 277, 278, 299, 410, 413, 427, 482, 485, 486, 489, 497. Widths equal the list on 214 of 216; the other 2 are 35 against 30, not looked into.
- Our pie plans: three saws from one line, and they move together, so they always meet on it (stone 266: tilt 0, no saw through a stone). A pie uses 3 saws. With a stone left out, the one remaining saw runs straight through.
- Saw view button turns the view so a saw is one straight line; exact in the 3D model, nearest frame in scan view.
- Not done: Edit saw does not work on pie plans; CSV and saved Advisor plans still use the first saw; fitting stones first and deriving saws (the user's idea) not tried; the 10 stones were not rerun after the pie changes.

## Stones first search and open saw question (2 Nov 2026)

- stonesFirst: stones placed in Voronoi cells of random seeds (plus the other searches' stones), saws worked out as the widest gap (one saw, then one in a part), stones refit, repeated, then refined. Only straight, nested layouts. Runs for 2 and 3 stones. Pie search is off (USE_PIE) because it cost minutes and did not raise the total.
- 10 stones, Advisor's saved states: Rs 1,746 against Advisor's 1,736; 0.152 ct, heaviest plans 0.162 ct (Advisor 0.191). By stone: 206 47, 216 118, 226 97, 236 150, 246 117, 256 284, 266 239, 276 192, 286 210, 296 292. Times 52-296 s per stone. The table now fills each stone count with the best plan any try found. Plans marked saw first or stones first; stones first won 236 and 276.
- Saws in Advisor files, user's rule: 3 stones have 2 saws, or one saw and one pie that cuts until it reaches a saw. Each stone record gives only one or two planes. On many 3-stone plans (22 of 142 multi-stone plans in the last full check) drawn plates do not divide every pair of stones: 207, 211, 223, 224, 227, 228, 240, 241, 249, 254, 256, 273, 276, 277, 289, 299, 410, 427, 429, 440, 459, 462. Calculating the third plate (through the saw line, along a table, or in the widest gap) did not fix them; 18 of 26 still failed, so the gap and table part was removed. The through-the-line calculation stays, and such saws are marked calculated.
- Next idea: each saw part has its own block of about 2.8 MB. It probably stores the part's own rough mesh; flat faces of that mesh would be the real plates, including the pie. Not checked yet.

## Saws read from named plates (2 Nov 2026, replaces every saw rule above)

- The plan's plates are the first cluster of names SawN-k / PieN-k in the file (e.g. Pie8-1, Pie8-2, Saw8-1). Normal 32 bytes before the name, offset 48, width 56; a marker pair 1, name length sits just before the name. Some records drop one byte from the normal, so they are 23 bytes; parseAdv rebuilds it and accepts only an exact unit vector.
- Patterns on 158 multi-stone plans: 2 stones S (90); 3 stones SS (33), PPS (24), PPPPS (3), SSS (6), PPSS (2).
- Check on 158 plans: no saw line through a stone; every pair of stones divided on 157 (289 is the exception). Run before the cell drawing change; drawing on pie plans was changed after it, so rerun it. Width equals the list on 7 fewer than all (40/30 once, 35/30 three times).
- A pie chain is one bent cut, not separate saws. On 227 two plates touch stone A, two touch stone B, one touches stone C. Each plate is drawn only as a face of the stones it touches (cells).
- The saw records also explain why 3 stone plans have parts weights in Result.N. Not used yet.
- Viewer: rough shown in coloured parts like Advisor, solid yellow saw plate. Pin rule default is now 0: the list's D-TOP-S and D-BOT-S zones add nothing (92.16 none, 92.16 at 80 um, 92.46 at 200 um), and dropping the pin rule raises the match to 92.2% in that test (88.7% with it).
- Own plans: fixed swapped sides in stones first. Pie from stones: two plates wrap one stone, saw between the other two. A plan with more plates must earn 5% more (user: the fewer plates the better). Search shortened (120 seeds, 3 full tries). Not measured since these changes.

## Three stones, two planes (2 Nov 2026, user's rule)

- Three stones take two planes: a saw across the whole rough with no stone on it, and a pie that divides the other two and stops at the saw. The file's extra pie plates are not drawn.
- parseAdv picks that pair from the stored plates. If none runs clean, it works the saw out from the stones (all points, marked calculated).
- Partly checked: of the first 96 multi-stone plans, 88 ended with stones less one planes before the calculated saw was corrected. With all points, the calculated saw did not fit on any of the 22 hardest stones checked (207, 209, 211, 222, 223, 224, 228, 234, 240, 249, 250, 253, 256, 257, 263, 270, 273, 276, 277, 278, 283, 299): no straight plane misses every stone at Advisor's positions, so they keep Advisor's 3 or 5 plates. Those are true three-way cuts, or our rebuilt stones are a little larger than Advisor's. Needs the user's view.
- Stones 227: 2 planes, seen on screen.
- 289 has no plate between its two stones.
- Our plans: pieFromStones removed, so own 3 stone plans always have a saw and a second plane stopping at it.

- User's photos of Advisor (2 Nov 2026, stone names not shown): one shows three plates meeting at one point with a stone in each wedge, a true three-way cut. The other is too busy to count. So stones where no straight saw fits keep Advisor's plates. The user is sending more.

- Stone 207 photo (user, 2 Nov 2026): a true three-way cut. Two pie plates wrap the orange stone, a saw divides blue from green, and the three meet. Numbers agree (plates PPS, each touching its two stones). A plate runs only between its two stones, so it must lie on the face of both their cells (every, not some). Drawn as a Y with no stubs; seen in the 3D view on 207 only.

- Correction (user's picture of 207, scan frame 156): the three planes of a three-way cut meet at a point, not a line, so stopping each plate between its two stones left a gap and lines ended in the air. Now the pie is one bent cut around the stone most pie plates touch: plates end at each other, and the saw runs up to the bent cut and stops (stops and avoid, no cells). 22 three-way stones: no saw line through a stone. Stones 222 and 273 show PPPS, 249 shows PS. On 207 the top of the picture is hidden by the buttons, so the join was not fully seen.

- Stone 207 3D photo (IMG_0101): Advisor draws plates as filled sheets tinted like the stone, with a thin bright yellow edge. A sheet over green bends down as a wall between green and orange, and the sheet over orange runs up to it and stops. So Advisor wraps green (stones 0 big, 1 green, 2 orange), the stone touched by the Saw and one pie; the viewer wraps the stone touched by both pies (orange). The join differs only near the corner. Viewer now draws tinted sheets. One sample, no rule yet for which stone is wrapped.

## Corners and our own three-way cut (2 Nov 2026)

- Each plate has two faces. A face ends on the matching face of the next plate: inner faces meet inside the bend, outer faces outside it, the saw stops on the outer faces, and a second saw ends on the near face of the first. Measured gaps: 0 to 3 um on Advisor's plans for 206, 215, 246 and on our 276 plan; closed loops on the other 11 Advisor stones checked and on our PPS plan.
- Baseline with two-plane plans only, Advisor's saved states: 10 stones Rs 1,756 against 1,736; 0.153 ct, heaviest 0.157 ct.
- threeWay added to our planner, used when no two-plane plan fits or it earns 5% more. Stone 276: Rs 187 with 3 stones and 3 plates (was 163 with 2 stones), Advisor 229, 353 s. Other stones running.

## MIN-MICRON and DISTANCE columns tested (3 Nov 2026)

Tested on 196 autook stones, 103,925 inclusions (comparison/inclusions-all.csv), against Advisor's saved marks.
- MIN-MICRON (20 for the smallest rows, 40 above) does not ignore small inclusions in the skin: inclusions of 0-10 um lying within 100 um of the rough surface are Use 83-89% of the time. Ignoring everything under MIN-MICRON first drops the match from 86.7% to 67%.
- Skin edge: small inclusions whose deepest part is within 100 um of the surface are Use about 90%; 100-125 um about 55%; 125-150 um about 32%; 150-200 um about 18%. The same in every row (0.02-0.09 ct), so the DISTANCE column (50, 75, 100, 105, 135 by row) does not set it; the edge is about 110 um for all rows. Using the DISTANCE column by row: 86.0-86.2% against 86.7% with a fixed 100.
- Our distance is to our rough mesh, sampled in steps (10, 25, 50, 75, 100, 125, 150 um), so the exact edge (105, 110 or 115) is not settled.

## Saw plate records (3 Nov 2026)
Advisor draws the saw from its plate records (SawN-k), not from the planes kept in each stone record. Save .adv now also writes the new saw into every plate record that holds the file's own saw (matched by value): direction at name-32, position (centre + thickness/2) 16 bytes before the direction and thickness 24 before; in records a byte short these sit one byte nearer. The new direction keeps the old one's sign. Tested on 416: 13 records changed, stones 14.5 and 7.5 um clear of the saw faces; copy 1.S525-416-sawfix.adv in autook/output, to be checked in Advisor. Before this fix, Advisor showed the old saw on two-stone plans whose saw moved (user: 416 wrong, 405 and 408 right).
Update: the plate records alone were not enough (user: 416-sawfix still wrong). The part records hold the same saw direction followed by the face positions (centre + thickness/2 at +24, centre - thickness/2 in others). sawPlates now rewrites every place with the old direction (by value, 1e-6; the first plate record reads ~3e-9 off) and the centre, faces and thickness next to it. 416: 29 places, 40 numbers; no old face or centre value left; 2 copies of the direction and 2 reversed remain inside the stone's polish records (ROUND/MARUTI, a turn matrix), left as they are. Copy: 1.S525-416-sawfix2.adv, to be checked in Advisor.

## Changing the stone count in an .adv (study started 3 Nov 2026, not done)
- The file is a tree of tagged blocks: 16-byte type ID, u32 version, u32 length (content follows). Root: type ca9b28c7..., length = file size - 24. Many child blocks follow a u32 field count, then nested blocks, with plain values between them, so simple end-to-start chaining does not recover the tree.
- Current plan stones sit ~3,000 bytes apart (402: placements at 16,615,138 and 16,618,131); each placement is inside a 420-byte block of type cb371440 (placement at +328). 3-stone files (474) have ~2.79 MB blocks between parts (part models). Advisor's result list (other solutions) comes later (402: group of 6 stones at 24.5 MB).
- To add or remove a stone: find each stone's own container block, copy or remove it, add/subtract its size in every enclosing block length (and the root), and update any stone count fields; part blocks (rough pieces) and saw blocks must follow. Not yet found: the stone container block and the count fields.
- Tools: comparison/experiments/adv_blocks.py (block scan, tree walk with small gaps). Test stones: 402 (2 -> ours 1), 411 (1 -> 2), 441 (1 -> 2), 475 (2 -> 3), 474 (3 -> 3).
- Fallback that works today: save the stone in Advisor with the wanted count once, then Save .adv writes our plan into it (same count).
- Block lengths are local: no block wraps a whole stone. The plan is a flat run of objects; each stone repeats a 2,993-byte pattern (402) starting at its placement block cb371440 (placement record at +328): aad24cb8, 59c4ea27, 2865304f, 492e50de, 11240963, three bdf96b8d, b6f6179d, a4a5dbec, b4c410d8 ... A stone count field was not found by comparing 1- and 2-stone files of different roughs (no common offset or count-before-block). Next step: diff two saves of the SAME rough from Advisor, one with 1 stone and one with 2 (asked the user for 402).
- Same rough saved by Advisor with 1 and 2 stones (autook/1.S525-402-1STONE.adv, -2STONE.adv): 2-stone is 2,792,473 bytes bigger, and the two saves differ in 65 places (compressed sections, part models, history), not just one inserted stone. Building a new stone count from scratch is not attempted.
- Working route: Advisor saves the rough once with the wanted count; our plan.json is applied to that file and written with the normal same-count save. 402: our 1-stone plan (1.190 mm) written into 402-1STONE -> autook/1.S525-402-OURS.adv, reads back at our size and centre; to be checked in Advisor.
- Several saws (3 Nov): when our plan and the file have the same number of saws (427: Saw14-1 and Saw14-2, two straight saws), the save first orders our stones so every file saw has one of ours splitting the stones the same way (each stone keeps its part), then writes each saw into that saw's records. 427: 2 saws, 34 places, every stone fully on one side of each saw; copy output/1.S525-427-sawfix.adv. A different saw count (pie vs straight) is not written and is reported.
- 411 and 412 filled from the user's 2-stone Advisor saves: 1.20 + 1.00 and 1.25 + 1.15 mm, saw written (10 and 9 places); written to output/1.S525-411.adv and 1.S525-412.adv. Fill Advisor saves needs the re-saves in a folder other than Output.
- 427-sawfix was wrong in Advisor (2 STONES, out of bound, parts 0.036 + 0.036 + 0.020 ct): saws were matched on whole-rough splits and turned by angle. Now each saw's role is the stones of its part (within planes) and how it divides them; stone order is chosen so every file saw has ours with the same role; each saw is turned so a stone of its part keeps its side. 427: sides identical to Advisor's structure after writing; copy output/1.S525-427-sawfix2.adv (our 1.156 alone in the single part, 0.951 and 1.254 in the pair part).
- Removing a stone (trial, 3 Nov): 412 (3 stones) has its plan stones 2.79 MB apart (placement blocks at 37,948,174 / 40,738,404 / 43,528,685), each with two 1.39 MB blocks (type 11240963) after its placement and ~139 KB of bdf96b8d records before it. Trial copies in autook/test412: stone 2 cut out [p2-a, p3-a) with a = 0 (cutA) and a = 139,100 (cutB); header fields at 20 and 24 reduced by the cut (24 is not always size-52: 412 had size-76); Result.3.Shapename ROUND -> round so our reader counts 2 stones. Our 2-stone plan filled in: -cutA-ours.adv, -cutB-ours.adv (1.254 + 1.146 mm; Advisor's second saw still in the file). Waiting for the user's Advisor check.
- Advisor opened cutA-ours and cutB-ours with our 2 stones shown, but with 2 saws (Advisor's second saw left). Saw trials: -cutA-ours-saw2-outside.adv (second saw moved 500 um past the rough: offset 3103) and -cutA-ours-saw2-ontop.adv (second saw set equal to ours), 14 places each.
- One fewer stone, generalised (3 Nov): cut [p_k, p_k+1) for k = count-2 (placement block starts), subtract the cut from header fields 20 and 24, lowercase Result.<count>.Shapename, fill our plan, then move each leftover saw 500 um past the rough (saw-outside) or onto our saw (saw-ontop, 2-stone plans only). 2 -> 1: the reader gives no saws for one stone, so the leftover saw is taken from the original file. Files for 401, 403, 413, 435 (3 -> 2) and 402, 404, 415, 425 (2 -> 1) in "autook/2026-11-04 Advisor check" with CHECKLIST.txt; all read back in our viewer with our stones. Cut sizes vary (2,993 bytes to 2.8 MB) because some stones carry their cut-part model and some do not.
- 2 -> 3 trial (475): stone 1's run [p1,p2) (3,086 bytes) copied in after itself, header fields 20/24 increased; the copy's D and star value nudged so its records differ from stone 1 (the save replaces every identical copy of a record); our 3 stones written to the first three placements (1.254, 1.112, 0.989 at our centres). Our plan uses a pie (2 pie planes + saw) and the file has one straight saw, so no saw is written. Our reader still counts 2 (Result fields list 2 parts). File: 2026-11-04 Advisor check/1.S525-475-2to3-test.adv.
- Expected part weights (from our saws, same calculation as the CSV export) are in CHECKLIST.txt in that folder, to compare with Advisor's part list.
- output/1.S525-427-sawfix2.adv was saved again from our viewer at 21:24 by the user (now 1.115 + 1.254 + 1.040), reported OK in Advisor.
- 475 2 -> 3 trial: the user's picture was our viewer, not Advisor. Our viewer shows 2 stones (it counts stones from the Result text fields, which still list 2 parts) and the loop is the scan-view saw outline. Not yet checked in Advisor.
- 475 stone-count hunt: 12 copies of 475-2to3-test, each with one u32 value 2 changed to 3 (positions 11,423,990; 11,467,327; 11,467,867; 11,467,871; 11,469,550; 11,470,155; 11,470,509; 11,470,589; 11,470,687; 11,471,658; 11,472,490; 11,472,774 - all before stone 1's placement block at 11,473,248), plus countALL. In the dated folder, section C2 of CHECKLIST.txt.
- 4 Nov: in Advisor, NONE of the files in "2026-11-04 Advisor check" open: every one gives an error and Advisor closes (with a "report error to Sarine" dialog). That includes the 412 cutA/cutB files (the earlier "stones show" was in our viewer). All of them changed the file length (stone cut out or copied in). Conclusion: Advisor does not accept files whose length or structure we change. Only same-length edits work (402-OURS, 408, 496, 416-sawfix2, 427-sawfix2 opened fine). Stone-count changes stay with the re-save route + Fill Advisor saves; no more structural edits.

## Advisor automation (4 Nov 2026)
Advisor PC: Windows 10 Pro, 1280x1024, Python 3.12 (no pip access: proxy/SSL), Advisor 7.601 Professional Lens 3 (MFC). Buttons "1","2","3" (ids 33000-33002) belong to AutoPlaning, not Advisor. Menu commands by WM_COMMAND id: Stone Open 42026, Save 42040, Save As 42027; Planning Makeable 42022 (user: 1 stone), Best Pair 42023 (2 stones), 3 stones = Best Pair 42023 then Best Remainder 42140 (user confirmed; not the single "Best + Best Remainder" 42024), MultiPlan 42106, Auto Planner 42216. Never send Help > License items, Tools > Allow Full Access, Options. Step 1 test script (Open + Save As only, ctypes) given to the user as advisor_step1.py.

## Advisor automation (4 Nov 2026)
- Opening works: Stone > Open (WM_COMMAND 42026) opens 'Load Stone' (StonesFilesDialogApp.exe, WPF). Walk TheGrid with ItemContainerPattern + VirtualizedItemPattern.Realize to find the row whose first cell = file name, ScrollIntoView, double-click the cell. Typing with SendKeys is unreliable (keys jump back to PowerShell); script must call SetProcessDPIAware or clicks land off target.
- Save As (42027) opens 'Save Stone', same layout as Load Stone plus 'Save Information': Stone Name box id NameTB, Comment, Stone Life Cycle, Script To Execute, buttons MasterSaveBtn and SaveBtn.
- Scripts: advisor-automation/advisor-step1.ps1 (open), advisor-step2.ps1 (planning + finish watch + Save Stone fill, no save).

## Controlled saves on 1.S525-276 (5 Nov 2026, in progress)
Folder on the Advisor PC: Desktop\test-276 (checklist CHECKLIST-276.txt there). Source: Desktop\1.S525-276.adv, identical (MD5 5C0F82EB...) to X:\AUTO OK and Y:\MARKING copies.
- Advisor's Save As of an unchanged stone is NOT byte-equal to the original (51,618,760 -> 52,494,144 bytes, regions moved by up to 9.7 MB). Always compare against the baseline save E01, never the original.
- Load Stone / Save Stone: the Directory box returns an empty value to UI Automation; its folder window is a plain 'Select Directory' (#32770) child of the dialog, edit id 1152 and button id 1 have no UIA patterns (use WM_SETTEXT and BM_CLICK). Check the folder by comparing the grid's file names with the folder.
- Baseline current plan: 3 placement records (-12345 marker pairs) 5,021-5,022 bytes apart, order B 1131.743, C 1575.207, A 1001.622 um (A = 1.00 mm stone), then a second copy of all 3 in the results list 10.26 MB further on.
- Each stone's diameter sits in 7 places per copy, relative to its marker m: m-3774, m-3579, m-3571, m-886, m-691, m-683, m-92 (one byte nearer in some records).
- Summary fields of the baseline: Result.cur.TotalPolishWeight 0.0241; Result.1 PolishWeightDouble 0.0038, PartUsage 23.75; Result.2 0.0056, PartWeight 0.02, PartUsage 28; Result.3 0.0147, 0.03, 49; stone.MultiSaw filled.
- First E02-diameter file (saved 00:07 before this session) is a ONE-stone save: current plan holds only A at 1011.622 um (exactly +10 um, in the same 7 places), Result.2/3 and stone.MultiSaw empty, total 0.0039, Result.1 PartUsage 24.38. B and C remain only in the results list. Cause (user): only stone A was selected when saving. So Save As writes only the selected stones into the current plan and summary fields (Result.N, MultiSaw), the rest stay in the results list. Select all 3 stones before every Save As. E02 to be redone; the old file is not used for the comparison.

### E02b: stone A diameter 1001.622 -> 1011.622 um (all 3 stones selected), compared with E01
Tools (own code, in tools/): adv_cmp.py (move-aware diff + per-stone compare aligned on the -12345 marker m), adv_dump.py, adv_region.py, summary.py, find_val.py, find_place.py. Full output: Desktop\test-276\cmp-E02b.txt.
Every place Advisor changed, offsets relative to stone A's marker m in the current plan (B and C records unchanged):
| Where | Baseline -> E02b | Meaning |
|---|---|---|
| m-92, m-683, m-691, m-3571, m-3579, m-886, m-3774 | 1001.622 -> 1011.622 | diameter, 7 places (writer already does this) |
| **m-84** | 216,780,967.1 -> 223,338,902.9 | **stone volume in um3** (ratio 1.030253 = (D'/D)^3). NOT written by our writer (write.js writes head D-56..D+72 but only angles, centre, D) |
| **m-922 and m-3810** | 0.0038031 -> 0.0039182 | **stone polished weight, ct**. NOT written by our writer |
| m-3612..m-3588 and m-724..m-700 | four doubles 0.5952, 0.7689, 0.7500, 0.5945 -> 0 (each after a flag byte 01, flag kept) | cleared by Advisor after the change; meaning unknown (cached scores?) |
| m-580, m-476, m-468 | changed in the last bit only (1e-16) | proportion values recomputed, same value |
| m-4930 (byte) | 0x2d -> 0x35 | small integer, unknown |
| m+12 (byte) | 0x0e -> 0x09 | small integer, unknown |
| header 76 | 0.0240848 -> 0.0241998 | total polished weight (exact sum) |
| header 104 | 0.0038031 -> 0.0039182 | stone A's weight (slot 1 = Result.1 = A here) |
| header 20, 24, 52, 60 | file size-24, size-76, preview picture length 61880 -> 61883, save time | |
| bytes 2212-61886 | preview picture (16-bit pixels, white = ff 7f) redrawn | |
| summary | Result.cur.TotalPolishWeight 0.0241 -> 0.0242, Result.1.PolishWeightDouble 0.0038 -> 0.0039, Result.1.PartUsage 23.75 -> 24.38 | writer already does these |
Not changed: part weights (header 88), part records, polish matrix, B and C, the results-list copies of the stones (still old A 1001.622). Other differences are not edits: memory-address junk at 3,292,684 and 37,952,940, and the results list (Template125 entries) reordered (all sampled bytes exist in the baseline).
- Checked on all 18 stone records in E01 and E02b: weight(m-922) = volume(m-84) x 1e-9 mm3 x 3.5088 / 200, exactly. **Advisor's density is 3.5088** (our 3.508 estimate). V/D^3 is 0.2107-0.2201, so the volume follows each stone's real shape; write our model's volume.
- Likely link to the 4 Nov puzzle (Advisor showed our stones at the OLD stones' weights 0.014 / 0.012 ct): the old volume at m-84 and weight at m-922 / m-3810 stay in our filled files. Writer fix for the Mac session: write volume at D+8 (m-84) and weight at m-922 and m-3810 in every record copy, using our model volume. Not yet tested in Advisor.

### E03-move (not a clean test)
User changed some inclusion states so stone A could move, then moved it. Result: all three stones changed (A 1001.622 -> 1006.026, B 1131.743 -> 1126.417, C 1575.207 -> 1300.000 exactly), total 0.0241 -> 0.0179 ct, file 52.49 -> 60.87 MB. The current-plan stones are now 2,792,099 and 2,791,990 bytes apart (each with its own ~2.79 MB block, as in other 3-stone files) instead of ~5,021 bytes, and in order A, C, B. So it looks like the inclusion change made Advisor re-fit every stone and store per-stone blocks (not proven: the exact clicks are not known). Not used to decode a move; to be redone without inclusion changes.
- How to move or turn a polished stone by hand (Advisor's own guides on D:\Advisor\Documentation): Polish > Fine Tune, select the stone, then Ctrl+M (Move Polish) and the arrow keys move it up/down/left/right; Ctrl+Y changes tilt. Or on the 3D control panel: Polish selector button, then the Rotate / Tilt buttons (left click small step, right click 90 deg). Right-click the Polish selector button to set the step size (um for moves, degrees for turns). Polish > Interactive (F8) moves the saw plane, not a stone (for the saw step).

### E03b: stone A moved (Fine Tune, Ctrl+M, arrow), compared with E01 (clean: sizes and total 0.0241 unchanged)
Full output: Desktop\test-276\cmp-E03b.txt. Changes in stone A's current-plan record (m = its marker):
| Where | Baseline -> E03b | Meaning |
|---|---|---|
| m-116, m-108, m-100 (= D-24, D-16, D-8) | (-155.641, 293.289, 1867.216) -> (-107.499, 321.372, 1889.436) | centre x, y, z in um; move (48.14, 28.08, 22.22) = exactly 60.0 um. Stored once in the current plan (old value only left in the results list). Writer already writes it |
| m-3619/-3611/-3595/-3587 and m-731/-723/-707/-699 | see below | the 4 unknown fields |
| m-4930 byte, m+12 byte, m-580/-476/-468 last bit | as in E02b | |
| volume m-84, weight m-922/-3810, diameter, angles, polish matrix, part records, header weights | unchanged | |
Summary: Result.2 and Result.3 swapped (now C 0.0147 then B 0.0056); values unchanged. The 650 KB after stone A and the 3.7 MB results area are moved bytes (all sampled pieces exist in E01).
- The 4 unknown fields, raw bytes from m-3624: E01 `01 00 00 00 01 0c e3 3f | 00 00 00 00 01 9b e8 3f | 00.. | 01 00 e8 3f 05 00 00 00 01 06 e3 3f`; E02b (diameter) all four high parts 0 (`01 00 00 00`); E03b (move) first and last `01 57 e7 3f`, middle two 0. Read as doubles they are 0.5952, 0.7689, 0.7500, 0.5945 (E01) / all 0 (E02b) / 0.7294, 0, 0, 0.7294 (E03b); as float32 1.774, 1.817, 1.813, 1.774. Advisor resets or recomputes them when a stone changes. Meaning unknown; worth testing whether our writer should clear them (set to what Advisor writes after a change).

### E04-turn: no change to any stone
User turned stone A (Fine Tune; Ctrl+Y or a Rotate/Tilt button), then saved. No stone record changed (angles, centre, all fields within 6,000 bytes before every marker identical to E01); summary unchanged apart from stone.Name. Only the preview picture (bytes 0-62K), the memory junk at ~3,292,670 / ~37,952,940, and one high-entropy block near the end changed. So the turn was most likely only a turn of the view, or it was not applied to the stone. To be redone; ask the user exactly what was pressed.
- Block before the summary area (~51,271,230 in these files): header with type id `2b 85 01 d0 1c 4a b3 3d`, length 0x297c (10,620), then high-entropy data with no zlib/zip header. It differs completely in every save, same length. Not decoded (could be encrypted; out of scope by the rules). Same-length edits that leave it untouched have opened in Advisor before.

### E04b: stone A turned (Fine Tune; the first E04 attempt turned only the view), compared with E01
Full output: Desktop\test-276\cmp-E04b.txt. Changes in stone A's current-plan record:
| Where | Baseline -> E04b | Meaning |
|---|---|---|
| m-148, m-140, m-132 (= D-56, D-48, D-40) | a, b, c = (1.868, 83.680, 81.354) deg -> (6.734, 79.335, 83.275) deg (radians stored) | turn R = Rz(c) Rx(b) Rz(a): total turn exactly 7.000 deg, stone axis tilted 4.74 deg. Stored once in the current plan (old values only in the results list). Writer already writes them |
| the 4 unknown fields (m-3619.. / m-731..) | first and last -> 0.5614 (high bytes), middle two -> 0 | recomputed again, as in E02b and E03b |
| centre, diameter, volume, weight, proportions | unchanged (last-bit only) | |
Summary: Result.1 and Result.3 swapped (now C first, A third), values unchanged. Advisor reorders Result.N on saves, so match Result.N to stones by weight, not by position.
- E04c (second turn, from the original): angles (1.868, 83.680, 81.354) -> (5.336, 62.941, 80.341) deg, total turn exactly 21.000 deg, axis tilt 20.76 deg; centre, size, volume, weight unchanged. Turns come in whole degrees (7, 21), so Advisor turns in fixed steps. Same places changed as E04b.
- The 4 unknown fields, all files (raw bytes from m-3628, 48 bytes): read as doubles at m-3619, -3611, -3595, -3587 they are E01 0.595/0.769/0.750/0.594, E02b all 0, E03b 0.729/0/0/0.729, E04b 0.561/0/0/0.561, E04c 83.17/-734.50/1923.00/616.25. Every value carries a byte 01 (or 05) where a low byte should be, and the E04c ones are near-quarter numbers, so this is probably a packed int32 + float32 layout and possibly screen or drag values from the last edit rather than geometry. Not proven. Test idea: copy E01 and set these 48 bytes to E02b's, and check Advisor shows the stone the same.
- E05-table: user set stone A's table 58.0 -> 61.8 % (MARUTI, Fine Tune); Advisor changed the crown with it. Saved with only stone A selected (1-stone file, total 0.0039), so only A's record is compared (tools/adv_cmp_rec.py, A at 37,302,259 in E01 and 37,292,149 in E05; the front of the record, before about m-660, has another layout in a 1-stone save and is not compared). Changes, at both proportion blocks (D-248 = m-340 and D-504 = m-596, fields by index):
  - field 1 table 0.58 -> 0.618 (m-588, m-332)
  - field 2 crown angle 0.637045 rad (36.50 deg) -> 0.682960 rad (39.13 deg) (m-580, m-324)
  - field 15 crown halves height ratio 0.640688 -> 0.666212 (m-476, m-220); field 16 unchanged (last bit)
  - field 21 crown + pavilion angle 1.354375 -> 1.400290 (m-428, m-172)
  - field 4 crown height NOT changed: Advisor keeps the crown height and recomputes the crown angle (tan(39.13 deg) x (1-0.618)/2 = tan(36.50 deg) x (1-0.58)/2 = 0.1554)
  - volume m-84 216,780,967 -> 220,249,234 um3 (+1.6%), diameter unchanged
  Our writer already writes fields 0-6, 15, 16, 21 in both blocks; it must also write the volume (see E02b).
- E05b-table: the same table change saved again with all 3 stones (user pressed Save Results first; total 0.0241 -> 0.0242). Same field changes as E05, plus:
  - weight 0.0038031 -> 0.0038640 ct, now at m-3800 and m-917 (E01: m-3810, m-922). The front of A's record is 10 bytes shorter before about m-3744 and 5 bytes shorter up to about m-660 (contents identical apart from the changed values). Some fields there change length with their value, so offsets within a stone record are NOT fixed: the writer must find each field by its old value (as it does for the diameter), not by a fixed offset.
  - the 4 unknown fields now first and last 0.98999, middle two 0.
  - stone C's record changed in 7 bytes near m-2461/-2453 (value -159.8346 and -1.98516e-6 there; meaning unknown, maybe shared with A through the pie cut).
  - Density, exact on all 3 stones in every file: weight ct = volume um3 x 1e-9 x 3.50874 / 200 (more exact than the 3.5088 above).
  - (see E06 for the stone C value)
  - Header: 76 total 0.0241456; 88/96 part weights and 104/112 polished weights now follow Advisor's Result order (Result.1 = C: 104 = 0.0146851, 88 = 0.03), not smallest first. Our writer puts the sorted weights in 104/112: should follow the Result order instead.
- E06-girdle: stone A girdle 3.0 -> 4.0 % (Save Results, all 3 stones; total 0.0242229). Compared with tools/adv_cmp_shift.py (each 128-byte chunk at its own byte shift). Changes in A's record:
  - field 0 girdle 0.03 -> 0.04 (m-596, m-340)
  - field 6 total height 0.62157 -> 0.63157 (m-548, m-292); crown and pavilion heights and angles unchanged, so the extra girdle adds to the total height
  - volume m-84 216,780,967 -> 224,650,714 um3 (+3.6%); weight 0.0038031 -> 0.0039412 at m-3810 / m-922 (shifted by 10 / 5 bytes, as in E05b)
  - the 4 unknown fields first and last -> 0.5715, middle two 0
  - B unchanged. Stone C changed one value at its m-2454: -2956.693 -> -3002.050. -3002.0496 also appears in A's record among a list of coordinates (A m-2654..-2422: -3174.47, -3002.05, -1585.90, 2886.56, 4302.71, ...; looks like corner coordinates of a box or part, um). In E05b the same C value changed too. So a change to A updates one number in C's record, probably a shared part/cut boundary. Not decoded.
- E07-star: stone A star 55 -> 50.5 % (all 3 stones, total still 0.0241). Changes in A's record:
  - field 17 star 0.55 -> 0.505 (m-460, m-204)
  - field 15 crown halves height ratio 0.640688 -> 0.686633 (m-476, m-220). Our writer's formula gives exactly this: rs = t c + (1 - t c) star, field 15 = (1 - rs c) / (1 - t), c = cos 22.5 deg, t = 0.58 -> 0.686633. Confirmed.
  - volume 216,780,967 -> 216,729,353 um3 (-0.024%); weight 0.0038031 -> 0.0038022 (m-3810 / m-922, shifted 10 / 5)
  - the 4 unknown fields: only a few bytes near m-697 changed this time
  - C: the same value at m-2454 -2956.693 -> -3002.050 as in E05b and E06; B unchanged.
- E08-half: stone A lower half 80 -> 77.1 % (all 3 stones, total 0.0241). Changes in A's record:
  - field 18 lower half 0.80 -> 0.771 (m-452, m-196)
  - field 16 pavilion halves height ratio 0.815224 -> 0.788432 (m-468, m-212) = 1 - (1 - half) cos 22.5 deg. Writer formula confirmed.
  - volume 216,780,967 -> 217,027,609 um3 (+0.11%); weight 0.0038031 -> 0.0038075 (m-3810 / m-922, shifted 10 / 5)
  - C: same m-2454 value as before; B unchanged.
- How the user made these saves (user, 5 Nov): after a Fine Tune and Save Results, Advisor adds the changed stone as a NEW result stone; the user deletes the old stone A from the results, then selects the 3 stones and saves. This explains: the first E02 and E05 holding only the new stone (only it was selected), Result.N order changing between saves (the new stone joins the list in a new place), and A's record being written fresh (fields 5-15 bytes shorter at the front). So these files show what Advisor writes for a newly made stone, not an edit in place. Our writer edits in place, which is still fine as long as every field a fresh stone carries is set.
- Summary of E02b-E08 (one change each to stone A): Advisor rewrites only the changed field(s), the fields that follow from them (15, 16, 21, crown angle, total height), the volume and weight, the 4 unknown fields, header and summary weights, and one value in stone C's record. Our writer already handles all geometry fields; missing: volume (m-84), weight (2 places, find by old value), header weights in Result order, the 4 unknown fields (effect unknown), C's m-2454 value (meaning unknown). cos(c) old or new is not stored anywhere (the polish record with the 3x3 matrix seen on 416 does not exist in this file).

## Read-only checks on 402-vol (Mac, 5 Nov 2026)
Compared autook/volume-test/1.S525-402-vol.adv with the Advisor file it was built from, advisor-resaves/1.S525-402-ADV1.adv (same length, 46 changed ranges). Advisor was not run, so none of this is proven in Advisor.
- No old stone value left in our file: old diameter (14 places), volume, angles and centre as doubles, and diameter, weight and volume as text, all gone. float32 hits for rotation terms, sizes and centre were few and scattered, consistent with chance; not checked one by one.
- 402 is a one-stone plan, so there is no saw and no neighbouring stone. Part records and the neighbour value (C m-2454) cannot be needed for the patch in this file unless Advisor still treats the part as separate.
- The 4 unknown fields are NOT screen or drag values: they are the previous result stone's own f15, f16, half and star. They sit at m-736 and about m-1850, 3-byte precision after a flag byte. Seen on 402 (1173.9 holds 1166.2's 0.5896, 0.7689, 0.75, 0.6; 1167.3 holds 878.9's) and 404 (911.0 holds 1208.8's, 825.2 holds 1255.8's). Probably the stone it was refined from. In 402-vol's current-plan record they are already zero, so they are very unlikely to cause the patch. This is an observation on Advisor's plans; it does not explain the E03b-E04 values on 276.
- The two 1.2 MB runs of 49-byte bdf96b8d records (16.8-18.0 MB, 18.2-19.4 MB, about 24,450 each) are an almost empty typed table: type 3, blank, with a few short texts (D, s, IF). Not geometry. Our writer leaves them alone.
- Not written by writeSummary and not checked for effect: ResultGroup.Cur.Sum.* (stage weights and yields). Summary values only, so unlikely to matter.
- Still not looked at for 402: the coordinate list seen on 276 (m-2654..-2422).
- Advisor folder: only plain settings and data files were searched (xml, config, ini; program files not opened). No setting for the out-of-rough check found.

## 402: our file against Advisor's rebuilt and Makeable saves (Mac, 5 Nov 2026)
Files in autook/402: 1.S525-402-vol-advisor.adv (rebuilt: Fine Tune diameter down 0.02 and back) and 1.S525-402-0.0061-nohatchedpatches-adviso.adv (Advisor's Makeable). Shift-aware byte diff of 402-vol against vol-advisor: only 21 to 135 bytes of shift, so a direct compare works here. It was made without a -base save, so ordinary save changes are not separated out.
- Stone data that differs: volume m-84 344,426,156 -> 344,396,996 um3; weight (2 copies, 16,613,436 and 18,007,822 in ours) and header 76 and 104, 0.00604251 -> 0.00604200 ct; the history fields (now the stone's own earlier f15, f16, half, star); m+12 byte 00 -> 09; m+61 byte 0f -> 11. Field 16 last bit only.
- Identical to the last bit or exact: diameter, centre, angles, proportions, the polish copies. So the rebuild changed no geometry.
- Not stone data: preview picture, memory addresses, scan photos (99.995% equal, 19.9-27.3 MB), save log text, the high-entropy block of 11,288 bytes (changes every save), inclusion counts Use 323 -> 308, Ignore 104 -> 119 (a recount of our inclusion changes; the writer leaves the summary counts stale), Result.1.PartWeight 0.039 -> 0.038, PartUsage 15.38 -> 15.79.
- m+12 is not an outside flag: Advisor's Makeable stone has 00 and no patch; plan results hold 0e. m+61 looks like a running stone counter (ours 15, rebuilt 17 after two edits, Makeable 18). Advisor's own current-plan stones have zero history fields.
- Makeable stone: D 1169.619, moved 20.0 um, axis tilted 10.44 deg from ours, table 58.0 (ours 58.7), crown 36.32 (36.50), pavilion 41.25 (41.10), half 82.74 (80), volume 345,010,107.
- Our model volume is 0.0085% above Advisor's on all three stones checked (ADV1 1173.881, Makeable, rebuilt), so stoneVolume is a constant factor out. 3 stones only.
- Rough gap by our model: Makeable and ADV1 stones come within 3 um (no patch in Advisor), ours is over 15 um (patch). So the patch does not follow closeness to the rough.
- Test copies (same length, autook/402), waiting for Advisor: testA 402-vol with Advisor's volume and weight; testB testA plus history fields, m+12, m+61; testC vol-advisor with our volume and weight put back. Reopening vol-advisor itself is also needed: the patch was only seen gone in the live session.

## Advisor's girdle has 48 sides (Mac, 5 Nov 2026)
- Corrects the note above: our volume was not a constant 0.0085% high. Over 33 stones of 401-416 it ran 0.0085-0.0107% and grew with girdle thickness.
- Testing girdle sides in brilliant: 16 to 1024 sides (ARC 2-128). Only ARC 6 (48 sides, 6 per 45 deg) fits: mean 0, spread 0.00001% on the 33 stones. 64 sides gave +0.0099%, 32 sides -0.029%.
- Independent check with ARC 6 on 22 stones from 417-480 (rotated stones, girdles 3.0 and 3.5%): -0.000005% to +0.000005%. Stones with assumed proportions (403 D 1488.1, 415 D 1340.9; no proportion block found) are not comparable and were left out.
- brilliant now uses ARC=6 (viewer/read.js); backup backups/viewer-before-48-girdle. On 402: model 344,396,998 against Advisor's rebuilt 344,396,996 um3.
- Size of the shape change: between 48 and 64 sides the rim moves about 1 um at most at this size (R x (1 - cos(pi/48)) = 1.3 um at R 586 um). This cannot by itself explain 15-20 um of apparent overreach on 416. Not checked: whether GIRDLE_REACH (the 16 corners) is still the right reading; those corners are unrelated to the 48-sided rim and were left in.
- Test files, autook/volume-48: 1.S525-401/402/403/416-g48.adv. Same length and plans as autook/volume-test, differing only in volume and weight values (401-403 rebuilt from advisor-resaves; 416 made by changing only those values in 416-vol). Not yet opened in Advisor.

## 401-g48 in Advisor: where the patch is (Mac, 5 Nov 2026)
User's screenshots: patches are still there on 401-g48, so an exact volume alone does not remove them (402-g48 and reopening vol-advisor not reported yet). User: the patches are at the end point of the rough. Checks used a local filled 401 (Downloads, same size as g48, same stones by weight and size: 1.254 + 0.958), the drive being away. Not tested on g48 itself.
- Facet lines: our stone 0.958 drawn over Advisor's Inclusion Projection (seen from the crown, mirrored, Advisor's frame needs no turn; inclusion 216 lands on the green dot) lands on Advisor's lines. By eye at 3.6x on one view. Panel values agree: table 58, crown 36.5, 15.5, girdle 3.5, pavilion 44, star 50, half 75. Facet count is the same. Advisor draws no rim-to-rim chords; those were only a drawing line in our edge list (low[g],low[gNext]), now removed.
- Patch place: big patch is a lens along a facet ridge on the crown, small patch on a facet corner, both near stone az -45 to -55 (our frame). The closest rough is there too: gap 22 um at az -45, r 0.64-1.0 (next closest 24 um, az 165-180 at the girdle). But the left part of the big patch has over 34 um by our rough, so the shape does not follow our rough's gap.
- Ruled out here: rough points inside the stone (none; closest 23 um); a large inclusion there (none of that size; patch about 140 x 235 um); the current saw (stone far from it at the patch); the other four rough-sized meshes (74 and 148 points) all hold the whole stone.
- Open: a lens on a ridge looks like a flat cut. Not tested: stale part model or Advisor's old saw from the re-save (needs ADV2 from the drive), though 402 has no saw and also showed a patch.

## Exact rough check on 401 (Mac, 5 Nov 2026)
Same local filled 401 (not g48 itself). User's screenshot shows a larger patch on the 1.25 stone: a thin slice across the girdle beside a red inclusion.
- The planner's check is a hard wall on stone points only: facet corners, edge midpoints, triangle centres and the 16 girdle corners, with 20 um. It does not test rough points against the stone.
- Exact test (every rough triangle clipped by all stone facet planes, planes moved out in steps): neither stone meets the rough. First contact between 20 and 25 um out: 1.254 at the culet, 0.958 at az -47 on the girdle. Advisor's own stones: 401 D 1217 20-25, D 975.7 0-5, D 945.3 10-15; 402 D 1173.9 0-5, D 909.3 0-5.
- Big 1.25 patch: placed at about az 10 from the nearby red inclusion, taken to be id 115 (rR 0.88, az 10-13), an assumption. Radial gap from the rim to our rough there: 60 um at az 0, 100 um at az 15. Rim to saw over 550 um.
- One flat cut ruled out: a plane through the patches on both stones is about 70 deg from the saw and passes through the middle of the 0.958 stone. Separate stale limits for each stone are not ruled out.
- So the patch is not explained by the rough we read, by our rough check or by the current saw. More rough safety would cost weight without a known reason. Still deciding test: does the patch return on reopening vol-advisor.

## Rough dents and the patch (Mac, 5 Nov 2026)
User's reading of Advisor's picture, taken as correct: the hatched band is where the stone meets the rough, and the stone beyond it is outside, so the outside piece is bigger than the band. This replaces reading the hatch as the outside area. User: the rough is uneven, with pits and cavities.
- Dents in our rough mesh (depth below an outer wrap, approximated with 4,000 directions) on 401: up to 102 um; 997 of 3,270 points over 20 um, 270 over 40 um. Beside the 1.25 stone the deepest are at az 4-20: 85-99 um at rR 1.01-1.16, zD -0.09 to -0.01, the same place as the big patch (place inferred from the red inclusion). The mesh therefore holds this dent at least in part.
- Mesh weight is above the file's rough weight on all 4 stones checked: 401 0.0426/0.038, 402 0.0417/0.039, 403 0.0597/0.056, 404 0.0443/0.042 (5-12%, not constant). Fits missing pits, but not proven: what header 68 measures (scale or scan) is not known.
- Closest distance to dent points (over 30 um deep), by stone: ours 67, 23; Advisor's 32, 31, 25, 51, 31, 10, 37, 57, 68. Advisor's stones do not clearly keep further from dents than ours, so this does not show Advisor sees deeper pits. 9 stones only.
- Mesh point spacing is roughly 65 um (estimate from surface and point count), so smaller pits may not be in the mesh. Part boxes: Advisor 2.18 x 1.94 x 1.17 and 1.36 x 1.69 x 1.18, ours 2.16 x 1.97 x 1.18 and 1.34 x 1.71 x 1.21 (10-30 um apart); measuring directions may differ.
- Viewer drawing: the star-to-rim and tip-to-rim lines in the middle of each section added (8 + 8), rim chords removed; the facets themselves did not change.

## Way 2: reading the rough from the scan photos (Mac, 5 Nov 2026)
Tried on 401-g48, read-only, no code in the program changed. User chose this over more margin.
- The file holds only three rough models (148, 74, 3,270 points; 0.0455, 0.0453, 0.0426 ct on 401). None weighs 0.038 ct. No sections to unzip in these files.
- Model outlines line up with the 300 scan photos (formula above). 1 frame will not decode, 14 are mostly non-background, others (e.g. 23, 79, 60) are partly corrupted; 144 passed a neighbour-frame check.
- Test: every stone surface point against the real outline of the diamond in each photo, Advisor's stones as control. First three edge methods failed the control (flood fill leaked through the clear stone; plain row walk ran past faint edges). Do not use their numbers, including a first look at frame 90 that seemed to show the model 50-110 um outside. Fourth method (local background, threshold 7 after a 3x3 blur) passes for the upper stones: Advisor 1217 and 1250 never outside in 144 frames (closest 25 and 6 um).
- With that method: ours 1254 outside in 5 frames, -33 and -11 um at the worst, near the culet side (rR 0.18, zD 0.40); not at the patch. Lower stones are NOT readable: Advisor's own 945 shows -274 um, same as our 958 at -292, so the low part of the rough fails the control, and frames 118 and 269 are bad for the 976/968 stones. The -256 um at stone B's patch is therefore not evidence.
- Big 1.25 patch: closest 46 um inside the real outline (frames 85-89), against 60 um by the model. Advisor's control is closer than that with no patch, so the outline does not explain this patch.
- By eye on frame 90: model about 10-40 um outside the photo edge on the right, close on the left.
- An outline cannot see a pit in the face of the stone, so outlines alone cannot deliver the pits. The 5-12% weight gap is not explained by outlines.
- Open: a thick black band runs down the diamond beside the patch in frames 90-105. Black strips also appear outside the diamond at other angles (142, 292), so it may be the holder seen through the stone, or a real feature. Not settled; the user can judge it by eye.

## The other rough models, the black band and inclusion states (Mac, 5 Nov 2026)
- The 148- and 74-point rough models are near-convex wraps (dents 8 and 4 um; 76 and 39 faces), heavier and with less detail than the 3,270-point model (dents 98 um here). The 148-point model appears three times, identical. They hold no pit detail.
- User: the black band in frames 90-105 is a pit. Tracked its two edges in 13 rows over up to about 50 frames (80-130): fits a fixed point in the stone (rms mostly 0.4-1.6 px). Nearly all points fall inside the rough model, so it is not the holder. Refraction through the diamond is not corrected, so positions are apparent ones.
- Advisor already stores this body: its points lie within 4-26 um of inclusion groups 34, 35, 37, 39, 29 and others. Large inclusion groups are one body cut into tiles (size capped at about 452 um, height centres 2226, 1776, 1327, 878, 434). 58 groups have 300+ points, up to 21,696. So pit-like bodies are in the file as Use inclusions, at Advisor's accuracy.
- The band is about 300-420 um from our 1.25 stone (apparent position), so it only lined up with the patch in that view.
- Advisor's tolerance into Use bodies looks like 10 um: 5 Advisor stones reach 10, 10, 9, 10, 10 um inside at most; ours 0.958 reaches 10. Our 1.25 reaches 59 um into id 419 (281 of 328 points inside; green at the top right of the user's screenshot, a Use inclusion by the file). Not the hatched patch. Why the planner allowed this was not checked.
- Inclusion states: buildAdv changed 138 on 401 and 15 on 402 from Use to Ignore. Id 115, red beside the big patch, was Use in Advisor's files. No proof this causes the patch.
- Test files, autook/volume-48: 1.S525-401-g48-states.adv and 1.S525-402-g48-states.adv, same as the g48 files with only Advisor's own inclusion states put back. Not opened in Advisor yet. Summary counts unchanged.

## Pit safety test on 402 (Mac, 5 Nov 2026)
New planner setting, Pit safety (viewer/plan.js pitRough, default 0): dents over 10 um below the outer wrap, full effect at 40 um, widened two mesh rings, are pushed inward by the setting in the planner's copy of the rough. The displayed rough does not change. Backup: backups/viewer-before-pit-safety.
Results on 402, one stone, Advisor's file ADV1, saved picks, rough safety 20, safety 10. Each is a separate random search, so small differences are noise. Files in autook/pit-test, not yet opened in Advisor:
| Pit safety | Stone mm | ct | Profit Rs |
|---|---|---|---|
| 0 | 1.156 | 0.00598 | 70 |
| 30 | 1.129 | 0.00558 | 61 |
| 60 | 1.088 | 0.00486 | 45 |
| 120 | 1.020 | 0.00406 | 28 |
| 200 | 0.886 | 0.00267 | -2 |
Compare: Advisor's Makeable stone on 402 is 0.00605 ct with no patch, so a wide margin costs more than Advisor needs; a better rough is still wanted.
401: asking for 2 stones returned 1 (1.2485 at pit 0, 1.1904 at pit 60), so no file: the Advisor file holds 2 stones. Needs a 1-stone Advisor re-save or a 2-stone search.

## Pit safety 10 on 10 random stones (Mac, 5 Nov 2026)
402 at pit 10 is clean in Advisor, pit 0 is not. Random 10 of the output folder, each planned with the file's own stone count, pit 10, rough safety 20, safety 10, 402's saved cut limits. 9 files in autook/pit10-test, results in pit10-results.json there, none opened in Advisor yet. Run in parallel in the page (10 workers); two tries for each stone from 460 on: normal, and forced count without prices.
- Sources: output for 8 stones. 460 and 470 from 401-500 with output's picks, because old-writer fills left Advisor's old diameter in output (12 and 6 places). 411's output file still holds 1.434 in 6 places as a source; none of the source diameters is left in any result, by exact match of the stones the source file held.
| Stone | Stones | mm | Rs | File's plan Rs | Note |
|---|---|---|---|---|---|
| 411 | 2 | 1.385, 0.767 | 58 | 108 | forced; free search 1 stone Rs 106 |
| 429 | 3 | 1.156, 1.050, 0.818 | 89 | 112 | forced; 1 of 3 saws not matched, left as in the file |
| 457 | 3 | 1.279, 0.910, 0.801 | 37 | 92 | forced; 1.279 in the blocked range; free search 2 stones Rs 107 |
| 460 | 2 | 1.254, 1.211 | 195 | 157 | normal |
| 470 | 1 | 1.549 | 137 | 142 | normal |
| 471 | 2 | 1.208, 0.832 | 71 | 107 | forced |
| 472 | 3 | 1.396, 1.170, 0.688 | none | | no file: plan has 2 saws, file 3 (pie cut); free search 2 stones Rs 186 |
| 478 | 2 | 0.958, 0.866 | 8 | 3 | forced |
| 489 | 3 | 1.286, 0.965, 0.886 | 63 | 91 | forced; 1.286 in the blocked range; free search 2 stones Rs 118 |
| 493 | 1 | 1.254 | 106 | 87 | normal |
Total of the 9 files: Rs 764 against Rs 899. Forced plans ignore the price rules. Stone count fit is the main loss: free searches often want fewer stones than the file, which needs an Advisor re-save at that count.
The writer reported inclusion changes on files planned from output (e.g. 457: 15, 489: 16, 429: 5); not investigated, a possible cause is split or Auto states not being kept.

## Advisor's Rough Skin window (user's photo, 5 Nov 2026)
Read from the user's phone photo of Advisor at 13:31, 1.S525-411-pit10 open, read by eye. Menu path not known.
- Rough: Leave 5 microns of rough (None is the other choice).
- Grooves and Naturals: None appears selected and the group appears greyed. Consider Holes Deeper 10 Microns As Grooves. Leave 0 Microns Between The Polish And The Groove. Options Show as Ball Inclusion, Reset After Mapping (unticked).
- Culet: None. Leave 0 microns between culet and rough surface, or By Table (Weight, Distance). Reset After Mapping ticked.
- Princess: Leave -1 microns between pavilion models and rough surface.
Fits earlier measures: Advisor's stones sit 0-5 um from our rough model on 401 and 402. Holes over 10 um as grooves is the same figure as PIT_FROM, by chance. Advisor has its own idea of holes in the rough; how it finds them, and whether the hatched patch is a groove or natural, is not known.
- User confirmed 5 Nov: in Rough Skin, Grooves and Naturals is on None. The Leave option exists but is not selected, so no groove distance is in use. The 10 um hole setting is shown but its effect under None is not known.
- Rough Skin is opened by right click in the Plan tab (user, 5 Nov).
- Advisor Options window, photos 5 Nov, read by eye, nothing changed. Only ticked or selected items are in force (user). Planes: remainder safety 0 um; Activate default saw thickness NOT ticked, so its weight table (0.5 ct 1.5, 1 ct 1.8, 2 ct 2.0, 3 ct 3.0) is not in force; automatic remainders amount 3, top size 0.10 ct. Planning: forced planning freedom high 30 deg, 30 deg, 15 um, low 5 deg, 5 deg, 10 um; flip table 90 deg; interactive polish tilt 20, saw tilt 10 deg; perform full planning when saving interactive result ticked (a possible link to the rebuild clearing the patch, not tested); enforce right angles in scoop planning ticked; 2 planes in best remainder; allocation level and cloud planning off. Multiplan: max loss 20%; Makeable 2 solutions, Twin/Pair 3, Best+Remainder 2, Triplet 2, Best Remainder 20, Sawless 20, min tilt differences 10-20. No setting seen for how far a stone stays from the rough, apart from Rough Skin.

## Correction: Fine Tune test on 402 (user, 5 Nov 2026)
Diameter down 0.02 mm: patch gone. Diameter back: patch back, no difference. The note that it stayed gone was wrong. Everything built on it is void: the search for a stored value, the reopen test, testA, testB, testC, the idea of a scripted rebuild, and the guess about full planning on save. 20 um less diameter is 10 um less radius, so on the 1.170 stone Advisor's limit is at most about 10 um further in than the stone at the patch, and that stone was 20 um or more inside our rough model.

## Pit bodies against the rough weight (Mac, 5 Nov 2026)
User's idea: small Use inclusions on the pit border. Tested on the local originals 401-404, read-only. Rough model less every closed inclusion body inside it, at a 15 um grid: 401 0.0426 to 0.0413 ct (file 0.038), 402 0.0417 to 0.0406 (0.039), 403 0.0597 to 0.0589 (0.056), 404 0.0443 to 0.0419 (0.042). So stored bodies close the weight gap only on 404. What the file's rough weight measures is still unknown. Adding an inclusion changes the file length, so it cannot be written. Inside our planner it would only repeat Pit safety, and its place would still come from the 65 um model. Not tested: making every inclusion that touches the rough a hard Use wall in the planner (id 115 beside the 401 patch went Use to Ignore; our 1.25 went 59 um into id 419).

## Rough models page (Mac, 5 Nov 2026)
rough-models.html stands alone (read.js inlined; re-inline if read.js changes). It draws the file's rough models with the plan's stones, measures each stone's surface on a 15 um grid against each model, and turns anything outside gold, with a slider for a near limit. Advisor's 401 stones give 25, 0, 10 um to the 3,270-point model, matching the exact check. Control: stones pushed 80 um showed gold.

## Inclusions outside the rough? (user's photo IMG_0150, 5 Nov 2026)
Photo: Advisor Plan tab, title 44.P523-684, 0.037 (0.038) ct, D 1.25 and 0.96, A 0.0073 ct, B 0.0034 ct, text "A out of bound, B +0 -1.5". User says the title name is wrong and the stone is 1.S525 (number not given). The name 44.P523 is not in the 401 copies on the Mac (they hold 1.S525-401 or -ADV2). Source of that title not known. Measured on 401 only, original and Downloads filled copy, every third inclusion point against the 3,270-point model: 102 of 2,449 pieces (original) and 102 of 2,453 (filled) reach outside it, at most 9.8 um. So on this stone inclusions lie on the surface, not beyond it. Filled copy: no Auto states; 45 pieces Use to Ignore, none touching the surface; 23 Ignore to Use. Only 1,568 of 2,453 pieces matched by id and first point, so these counts are partial. Photo's stone not identified; meaning of "out of bound" not known.

## Inclusion 115 and why the rough model runs past it (Mac, 5 Nov 2026)
User, in Advisor: inclusion 115 of 1.S525 is the last inclusion at the rough's border; nothing lies beyond it there, yet our viewer shows rough beyond it. Stone is 401 (user confirmed 5 Nov).
- Id 115 on the original 401: 2 pieces, state Use, about 40-55 um across. 134-140 um inside the 3,270-point model, measured outward from the rough's centre. Over the stone, the gap from the last inclusion to the model edge has median 25 um, 75th percentile 70 um.
- Scan frames 84 and 234 (opposite views, 115 nearest the outline; images in rough-check/): model outline follows the diamond's outline in the photo closely by eye, and 115 falls in the black band, well inside it. An outline shows the furthest material at any depth, so it cannot say what is at 115's own depth. Refraction not corrected.
- Slices square to the scan's turning axis are nearly convex, section area / wrap area: 401 0.9993, 403 0.9996, 402 0.9947 (one slice has a 267 um dent), 404 0.9592 (median dent 75 um). Against a cross axis 0.93-0.96. So on 401 and 403 the model behaves as built from outlines while turning: it can hold a notch along the axis, not a pit in a side. Fits the extra model weight, but not proven; 404 does not fit and how the model is built is not known.
- With earlier figures (rim 60-100 um from the model edge near 115, place inferred) our 1.25 rim would pass about 35-75 um beyond 115, which would fit the big patch. Not measured directly.

## Unread rings in the file, and laser marks (Mac, 5 Nov 2026)
File map of 401: scan photos, 5,404 tagged meshes, little else. The largest tagged item is not a mesh: offset 834,813, 10,831 records, no faces, skipped by the reader as damaged. Each stone has one near 0.75-0.85 MB (402 8,993 records, 403 10,779, 404 11,186).
- Records are x, y, z in rough coordinates. They fall in rows about 46.3 um apart in z, each row roughly tracing the rough's outline; see rough-check/401-hidden-rings.jpg (green inside our model, red outside it; left x-z, right y-z). What they measure is not known.
- Read up to the first unreadable record: 401 6,110 points, z 0-1691 of 2944; 402 4,345, z 0-1235 of 2697; 403 2,156, z 0-762 of 3707; 404 all 11,186, z 0-2179 of 2182. The rest of 401-403 not decoded, so 115 (z 1905) is not covered yet.
- Distance inside our 3,270-point model, median: 13, 10, 4, 6 um; 95th percentile 50-68 um; 8-16% of points outside it (they are not all on the surface: some rows hold scattered points).
- Row area against our model's section, total (points sorted by angle, rough estimate, inflated or deflated by scattered points): 401 0.902, 402 0.911, 403 0.817 (few rows), 404 0.946. File rough weight / model weight: 0.892, 0.935, 0.938, 0.948. Suggestive, not proven.
- Other large block: 1,441,317, 2.1 MB, runs of x, y, 0 up to about 9.2 x 6.7 mm with y steps of 54.7 um. Too large to be the stone; not understood.
- User, 5 Nov: the symbols seen in the scans are laser marks on the outer surface. So they are real surface points. Cross on 401 seen near frame pixels (501,484) in frame 84 and (523,483) in 234. Inclusion 161 projects to (497,484) and (527,484), 34-49 um inside our model, which would put the model outside the real surface there. Match by one view axis only, not confirmed.

## Display inclusions as points (user's photo IMG_0151, 5 Nov 2026)
Advisor option shows inclusions as green and red points in level rows over a scan picture. Same title and stones as IMG_0150. Option's menu place not given. Row spacing in the photo could not be measured (screen pattern in the phone photo).
Checked on 401: inclusion mesh points (192,156) repeat in height every about 14 um (best spacings 14, 28, 42, 56, 70), so they fit level rows. The unread rows repeat every 46 um and are separate data: median 60 um from the nearest inclusion point, 2% under 5 um (first 3,000 points; points with no inclusion within about 30-60 um counted as far).
User confirmed 5 Nov: the stone in IMG_0150 and IMG_0151 is 1.S525-401; ignore the title 44.P523-684.

## The fine rough model decoded (Mac, 5 Nov 2026)
The unread rows are a closed rough model, not loose rings: the tagged item near 0.75-0.85 MB has size 8 + 24 V + 16 (2V - 4), so V points and 2V - 4 triangles (count, then 3, a, b, c). parseMesh fails on it because bytes go missing part way (401 at point 6110, 402 at 4345, 403 at 2155; data then runs 3-11 bytes off, one or two more shifts in the faces; 404 only in the faces). Decoded with resync: 3 points lost and filled from neighbours, 2 small holes closed by a fan. Code: fineRough in rough-models.html.
| Stone | Points | Fine model ct | File rough ct | 3,270 model ct |
|---|---|---|---|---|
| 401 | 10,831 | 0.0374 | 0.038 | 0.0426 |
| 402 | 8,993 | 0.0385 | 0.039 | 0.0417 |
| 403 | 10,779 | 0.0560 | 0.056 | 0.0597 |
| 404 | 11,186 | 0.0417 | 0.042 | 0.0443 |
All four round to the file's weight. Deepest pit on 401 243 um (102 in the 3,270 model).
- Inclusion 115 on 401: closest -1 um, so it sits on this surface, as the user saw in Advisor (it was about 135 um inside the old model).
- Advisor's own stones, closest to this model: 401 1217 10, 945 1; 402 1174 2; 403 3, 2, 10; 404 8, 33 um; all inside. Two are not: 401 976 outside 5.4% of its surface by 18 um (around z 2617, flat area about 890 x 490 um), 402 909 outside 4.3% by 21 um. Not explained: the model may be off there, or Advisor allows it.
- Our filled 401 against this model (taken from the original): 1.254 outside by 61 um on 2.3-2.5%, 0.958 by 12 um on 0.6%. The middle of the 1.254's outside area is about 100 um from inclusion 115, where the big patch is. All older models say both stones are inside.
- Advisor's re-saved file (ADV2, our filled copy) gives many shifts and 0.0347 ct, so it does not decode cleanly yet; the page takes the model from the original by the Fine rough from original button.
Planner not changed. Pit safety, the Way 2 outlines and the near-convex finding were working around this model.

## Fine model in the planner (Mac, 5 Nov 2026)
fineRough moved to viewer/read.js; parseAdv uses it as s.stone when within 4% of the rough weight, else the old choice. A gap loses 3 points, not 1: numbering after a gap is chosen by fewest edges over 250 um. Corrected weights: 401 0.0380 (0.038), 402 0.0388 (0.039), 403 0.0564 (0.056), 404 0.0417 (0.042), 276 0.0675 (0.068), 2.S526-402 0.0610 (0.061), 2.S526-401 0.0650 (0.065). Works on Advisor re-saves and filled files. Size may run 64 bytes over the formula on some files. Unprocessed 44.518-809 does not use it.
Corrects the earlier section: all 12 Advisor stones on 401-404 and 276 are now inside it, closest 1-33 um, including 401 976 and 402 909. Our old 401 plan stays outside: 1.254 by 61 um, 0.958 by 11 um.
Pit safety does nothing on the fine model (pitRough). Rough safety stays 20, safety 10.
Planner on the fine model, cut limits as defaults: 401 1 stone 1.254 Rs 98, 2 stones 1.201 + 0.982 Rs 99; 402 1.146 Rs 64 (2 stones 1.061 + 0.914 Rs 44); 403 1 stone 1.474 Rs 106, 2 stones 0.958 + 1.231 Rs 110.
Test files on the drive, autook/fine-test: 1.S525-401-fine (from ADV2, 1.201 + 0.982), 402-fine (from ADV1, 1.146), 403-fine (from ADV2, 0.958 + 1.231). Our checks find none outside the fine model. Not opened in Advisor yet.
Rough-models page reader re-inlined. If read.js changes, inline it again. Older files on the drive (output, pit-test, pit10-test) were planned on the old model.

## Rough safety 5, Pit safety removed (Mac, 5 Nov 2026)
User checked autook/fine-test in Advisor: no patches. User's request: rough safety 5, Pit safety removed. Default is 5; saved older rough values are cleared once (adv-our-safety-2); opening a plan file no longer changes it. pitRough and its box are gone.
Free search at rough safety 5, safety 10, Rs: 401 1.252 Rs 105 (2 stones 1.252 + 0.903 Rs 105; was 99); 402 1.167 Rs 73 (was 64); 403 1.254 + 0.975 Rs 118 (was 110); 404 1.249 Rs 100.
Test file autook/safety5-test/1.S525-401-r5.adv on the drive: 1.252 + 0.903, built from the Downloads 401 file (an earlier fill, not a clean re-save; drive not attached). Closest to the fine model 4.8 and 1.9 um, 0.04% or less of the surface under 5 um. Not opened in Advisor. Only this file: other stones need re-saves with the plan's stone count.
User checked autook/safety5-test/1.S525-401-r5.adv in Advisor, 5 Nov: perfect, no patch at rough safety 5.

## Full auto Bulk plan (Mac, 5 Nov 2026)
Bulk plan: a plan that fits the stone's file (stones and saws) is written at once. Otherwise [stone].plan.json holds the best plan, [stone].adv holds the best plan the file can hold, or Advisor's own file when nothing of ours beats it, and the stone goes on resave-needed.csv. A stone whose own plan earns more is copied unchanged, unless it holds a blocked size.
advisor-automation/advisor-resave-all.ps1 (from the proven advisor-resave.ps1 helpers) waits for the list, works from a copy, saves to [Output]/advisor-resaves as [stone]-ADV[count].adv, skips failures and writes resave-done.txt. Viewer polls every 15 s, fills each save when its size is steady, checks stones, saws and rough, updates bulk-compare.csv. Brief: BULK-AUTO-PC.md.
Tested on the Mac only, in a private browser folder with stand-in saves: 401 forced to 2 stones filled from a 2-stone file (0.938 + 1.252, Rs 108, 2 stones, same length, fine model read back); 402 got a wrong-count stand-in and kept Advisor's file with the reason shown. PowerShell not run (brackets and ASCII checked only).
Found: on 401 Advisor's own plan (1.22, 0.98, 0.95) earns Rs 117 by our prices, our best Rs 105-108; our 3-stone search returned 2 stones. On 402 Rs 72 against our Rs 73. Our planner does not always beat Advisor.
Second test: 401 unforced, Advisor's plan Rs 117 beat ours, so its file was copied unchanged. That run took 8.7 min for one stone on the Mac, 2.7 min on an earlier run; time varies by run.

## Rough cost (Mac, 5 Nov 2026)
User: rough diamond cost per carat counts in profit. New Cut limits setting, Rough diamond cost, default 0 until the user gives it. Rough cost = stored rough weight x rate. Net profit = profit - rough cost, shown in the stone panels, the Bulk report, bulk-compare.csv and advisor-best.csv. It is the same for every plan of a stone, so the search and the choice of plan are unchanged. Reset to our values clears it to 0.

User, 5 Nov: Advisor has an option to save only the selected result. After a planning command its stones are selected automatically: 1 after Makeable, 2 after Best Pair, 3 after Best Pair + Best Remainder. So the re-save script needs no select step for these three. Option's menu place not given.

## Bottom of the stone rule (Mac, 5 Nov 2026)
User: nothing above 100 um in the bottom 10% of a stone's height, any category, measured in 3D. New settings adv-culet-limit 100, adv-culet-bottom 10. Size is the 3D diagonal of the box around all an inclusion's pieces (inclusionSizes, viewer/plan.js). Advisor's exact measure is not known: on 206 none of the measures tried fits exactly. Ignore inclusions above the limit go to the search with code .25, Auto above it .5; only the bottom zone blocks them.
428, our inclusion choices: was 1.218 + 0.938 Rs 98, now 1.197 + 0.951 Rs 95. Inc831 (3D 209 um, Ignore) goes from 12.6 um to 3.7 um into the bottom zone. The search lets any inclusion sit up to the 10 um Safety inside the surface, so that remainder is by the Safety rule. Only 428 tested.

## Autobaki files and Advisor saved copies (Mac, 5 Nov 2026)
User on autobaki 4603: the top 30% shows nothing and inclusion shapes are not right. Confirmed on 4602 and 4603: unprocessed autobaki files hold raw inclusion points only, in chunks that stop at about 60-70% of the height. Shapes are built by our grouping, not stored. The Advisor saved copy of 4602 holds 1,067 inclusions over the full height, with real shapes, all Ignore (autobaki 188).
Earlier advice to use autobaki as input was wrong: the planner cannot see inclusions in the top third of those files.
fineRough: a gap can land on a whole number, so all values stay valid while x, y and z change places. Now caught by a height jump, and the place is chosen by smooth steps across 24 points. A loop index past the end caused the crash on 4603. AUTOBAKIADVISOR 4602 now reads 0.0203 ct (was 0.025). 401-404, 276 and a filled 401 unchanged.
Not solved: AUTOBAKIADVISOR 4603 (fine model gives NaN) and 4604 (0.0146 for 0.016). Both are refused by the weight check and fall back to a coarser model: 4489 points 0.0147 ct for 0.014, 5336 points 0.0165 for 0.016, 5% and 3% heavy, so stones could go outside the rough there. Saved rough weight also differs between folders on 4603: 0.013 and 0.014.

Later 5 Nov: fineRough now reads all three Advisor saved copies. A gap can leave a place 8 bytes out, which reads smoothly with x, y, z swapped, so the place nearest the last point wins. A height jump only counts as a gap if the points that follow are not smooth. AUTOBAKIADVISOR weights: 4602 0.0203 (0.02), 4603 0.0137 (0.014), 4604 0.0155 (0.016). Edges over 250 um: 154, 520, 79, against 50-116 on sound stones, so 4603 may still have part of its numbering wrong. User's screenshot of 44.518-4604 saved 1 Nov (the autobaki copy) shows no inclusions in the top part.

Inclusion coverage, 5 Nov: 44.518-4604 frame 27, all inclusion points over the photo (rough-check/4604-saved-vs-autobaki.jpg). Advisor saved copy covers the whole stone; autobaki copy has flat-edged empty bands. Advisor saved files: every inclusion record is read. 1,442 and 1,566 meshes left out as merged copies hold no new shape (checked at 30 um). About 30 of 2,500 meshes are lost to a break that repeats about every 153 KB, about 4% of points (3,553 of 88,244 on 4602); not recovered yet.

Correction, 5 Nov: autobaki files do hold the inclusion points over the whole height. The zip directory lists one more section than the reader found: its local header has the first 14 bytes wiped, including the PK mark and method (4604 at 11,129,323). unzipSections now finds sections by name. Sections that drift are read in windows at any byte shift; test uses the best shift too. 4604: 18,655 to 32,710 points read, 2,170 skipped; 4603 23,499 to 33,492; 4602 44,630 to 54,623. All heights covered. Shapes in these files are still built by our grouping from points (POINT_CELL_UM), not Advisor's shapes.

Later 5 Nov, 44.518-4636: its middle point section is damaged in the compressed data from about byte 53,000 of 80,000; the rest unpacks with records drifting by odd bytes. rawInclusionPoints now tries all 8 byte shifts, in 512 byte windows, then 64 byte steps where under 90% read. The band that had 73 points now has 1,181. Tail bytes that remain garbage are lost.
Shapes from points against Advisor's on 4604 (20 um cells, within one cell): Advisor's shapes covered 99.6% at every setting tried; ours on Advisor's 90%. POINT_GROUP_UM 35 gives 482 groups against Advisor's 447 (25 gave 785), so it is now 35. Cell size stays 12 um, smooth 4.

## Unopened autobaki files: damaged point sections mended (Mac, 5 Nov 2026)
All 101 files surveyed. Points run in height order through the sections (80,000 bytes unpacked). In many files a section has lost about 50 packed bytes: its header sizes overstate it, the gap to the next header is 41 where 91 is normal, and it unpacks about 70 bytes short. Deflate falls back into step, but copies that point before the loss land in the wrong place, so the rest reads as rubbish. mendSection unpacks again with room for the lost output at the place the rubbish starts (size - length). Sections over 5% rubbish: files 35 to 1. Files with a height gap over 100 um: 54 to 12, and those I read showed stray far points; 4636, 4616 and 4676 have no gap inside the stone, only 4636 and 4676 empty at the top 10-20% of height, cause not known.
Against Advisor's shapes, 20 um cells, within one cell: 4602 100.0% covered, 99.9% ours on Advisor's; 4603 99.2%, 95.6%; 4604 99.6%, 90.4%. Point reads: 4636 25,691 to 28,249.
Joining distance back to 25 um. Groups at 20, 25, 30, 35 against Advisor's 347, 266, 447: 343/322/1023, 239/210/785, 190/153/600, 161/111/482. No value fits all three. The two large blocks (about 1.4 and 0.7 MB) start with 52 and 21 points on a ball of about 365 um radius, not inclusion data; not decoded.

## Fourth value of raw points (Mac, 6 Nov 2026)
Raw point record: x, y, z, then a fourth 16-bit value, 0 to about 300 on sound records, negative or large on misplaced ones. On 4602, sampled points within 120 um of the rough: mean distance to the nearest model point by value bucket 0: 17, 16: 27, 32: 42, 48: 57, 64: 73, 80: 89, 96: 105, 112: 116. So it looks like depth below the surface in um. The 120 um cut biases the top buckets, and only one stone was tested. Reader now keeps only values 0 to 400 (POINT_FOURTH_MAX), and uses them to find the record place.
Against Advisor's shapes, 20 um cells within one cell, covered / ours on Advisor's / groups (Advisor): 4602 100.0 / 99.9 / 239 (347); 4603 99.2 / 99.0 / 197 (266); 4604 99.7 / 97.4 / 444 (447).

## One file holding all plans: 402 all (Mac, 6 Nov 2026)
User's save after Makeable, Best Pair, Best Pair + Best Remainder, last = 3 stones. 35.5 MB. Current plan: 3 full records, 2.79 MB apart, 881.6, 1166.2, 739.7 um. Results list at 32.9 MB: 6 stone records about 3 KB apart: 881.6, 1166.2, 1173.9, 878.9, 1167.3, 872.5. So 7 different stones. The list holds pairs, with no 739.7 copy and no 1-stone group by spacing; which row is which plan is not confirmed. Part blocks exist only for the current plan. All saw names sit together, 46 places. User: the last command run is the one selected when saved. No current mark found yet.
Test copy autook/402 all/1.S525-402-all-test.adv: only the results list diameter 1173.9 changed to 1100.0 at 32,901,178 (8 bytes), to see if Advisor reads list rows.

The two 402 all files above were saved with only the selected result. 1.S525-402-all-correct-new.adv (43.9 MB, all results): six full stone records 2.79 MB apart in plan order 1173.9; 881.6, 1166.2; 881.6, 1166.2, 739.7, so each plan has its own full part data. Then a results list near 41.27 MB (records read a byte off). Test copy 1.S525-402-all-new-test.adv: every copy of the 1173.9 diameter set to 1100.0.
User, 6 Nov: 1.S525-402-all-new-test.adv opens in Advisor. The Makeable result shows 1.10 mm; stones of 1.17 in other plans are unchanged (different values, not edited). So Advisor reads a result's stone from the file when that result is shown, not only the current plan. Not known which of the 14 edited copies it reads. Still needed: the mark for which plan opens first (1.S525-402-all-mk-last).

## Which plan opens first (Mac, 6 Nov 2026)
Use only 1.S525-402-all-correct-2 (Makeable, Best Pair, Best Pair + Best Remainder) and 1.S525-402-all-mk-last (Best Pair, Best Remainder, Makeable). Plans are stored in the order run, and the current plan is the last: mk-last ends with the 1173.9 stone. Header doubles (76-120) and summary fields follow the current plan: mk-last total 0.0061, then 0.039, -1, 0.0061, -1; Result.2 and .3 blank, with a shorter value. The 6-record list after the plans is the same in both. parseAdv picks the wrong stones on all-results files.
Test copy 1.S525-402-all-open1-test.adv: correct-2 with header and same-length summary fields from mk-last, to see if those alone change the plan Advisor opens.
User, 6 Nov: 1.S525-402-all-open1-test.adv opens on 3 stones. So header and summary do not set the opening plan; the stored order does, as far as tested (Result.2 and .3 fields could not be blanked at the same length). Moving a plan to last would change byte positions over many MB, not tried. Decision for now: keep one save per stone with the wanted count run last, as advisor-resave-all does. parseAdv fix for all-results files only needed if they are used.

## Tick boxes set the opening plan (Mac, 6 Nov 2026)
Corrects the note above: all-tick-3 and tick-1 store the plans in the same order, yet tick-1 opens on Makeable with its box ticked (user). So the tick decides, not the order. Other than previews, picture blocks and offsets, differences include byte 525 (1 to 0, tick-1 at 517), byte 16,623,053 (1 to 0), and 14 bytes at 43,000,526 (01000000 01000000 a3000000 47010000 to 00000000 01000000 ffffff7f 00000000). Test copy 1.S525-402-tick-switch-test.adv: all-tick-3 with those and header 76-120 from tick-1.

Tick tests, 6 Nov: T1 (byte 525), T2 (byte 16,623,053), T4 (header) change nothing. T3, T6, T7 (14 bytes at 43,000,526) open with no plans. Real difference at 33,370,477, just after the last stone record: all-tick-3 has 2b 00 00 00 2e 00 00 2d 00 (43, 46, 45), tick-1 has 27 (39), 8 bytes shorter. Looks like the list of ticked stones, with zero bytes dropped. Offset table near 42.99 MB follows it. Test files in 402 all/tick tests 2: U1 list padded + tail, U2 list padded, U3 list shortened, table entries moved 8, tail, 8 bytes added at the end.
User, 6 Nov: U2-list-padded opens with Makeable selected and shown. U1 (padded list + tail) shows the empty stone; U3 (shortened) does not open. So the ticked list after the last stone record is the switch and can be set at the same length: list bytes replaced, spare bytes zero, the 14-byte group left alone. Works on 402 only, for Makeable (id 39). Ids for Best Pair not known yet; ids on other stones not known.

Best Pair tick list on 402 read from 1.S525-402-all-tick-2.adv; test file 402 all/tick tests 3/V1-best-pair-from-3.adv is all-tick-3 with that list, zero filled.

User's definition of a pie, 6 Nov: one saw runs fully across the rough; a second saw runs only until it meets the first. That part-way saw is the pie. Files show names like Saw13-1 with Pie13-1 and Pie13-2 on a 3-stone plan, so check how the plates map to this. Our second saw with 'within' already stops at the first, so some plans called straight here may be pies to Advisor.

Pie plates on 1.S525-276 (Saw14-1, Pie14-1, Pie14-2; user's picture, stone name not yet confirmed). Stones 1131.7, 1575.2, 1001.6. Pie14-1 and Pie14-2 are 56.5 degrees apart and both keep 1131.7 on their positive side (419, 532 um), so they form one bent cut around that stone. Saw14-1 has the 1575.2 on one side (-572) and the 1001.6 on the other (436), and the 1131.7 at +196, so it divides those two and stops at the bent cut. Fits the user's rule with the bent cut as the full cut. Idea to test: a straight plan with one full saw and one stopped saw could go into this slot with both pie plates on the same plane.

currentPlan, 6 Nov: the header double at 76 is the ticked plan's exact total, from stored volumes (tick-2: 0.008769 = 881.6 + 1166.2). The run of consecutive stone records with that total wins. fileSaws on all-results files are not fixed yet: they read the first plates in the file.

404 tick saves in Downloads, 6 Nov: list after the last stone record: 1 tick 11 00 00; 2 ticks 13 00 00 12 00 00 00; 3 ticks 14 00 00 00 17 00 00 16 00 00 00. Near the end, value pairs follow the tick count: 3 ticks a2/144 and 8/16; 2 ticks 36/6c and 6/12; 1 tick ffffff7f/0 and 4/8. T3 changed only the first pair, which may be why plans vanished. Tests in ~/Downloads/404-tests: X1 2 stones list + both pairs, X2 1 stone list + both pairs, X3 2 stones list only.
User, 6-7 Nov, 404 tests: X3 (2 stones, list only) error. X1 (2 stones, list and both pairs) does not work. X2 (1 stone, list and both pairs) loads but no stone is selected and 3D stays blank until a stone is clicked. So more values depend on the ticks than the list and two pairs. Recommendation: stop same-length tick edits; keep one Advisor save per stone with the wanted count run last.

## .stn file (39.C424-1413.stn, user's adv2stn output, Mac, 6-7 Nov 2026)
4.3 MB. Name, machine BALO-3, Most Accurate, rough weight double at 16 (0.067). Two zip sections: rough models, points then count then 3,a,b,c faces, 6,764 points 0.0671 ct and 4,456 points 0.0686 ct, height 0-2950 um, no byte gaps in the models read. 201 outlines (110,242 x, y, 0 points), the same kind as the outline block in .adv files. No mesh tags, inclusion names, images or saw names. Tail 43,546 bytes not decoded.

1.S525-402.stn, Nov 2026: same stone as 1.S525-402.adv. Fine model 8,993 points, 17,982 faces, 0.0388 ct. Against fineRough on the .adv: 8,990 of 8,993 points identical, the 3 points at the gap differ by at most 29.7 um; 17,971 of 17,982 faces identical. Second model 4,100 points, 0.0417 ct, is the old model. So the decoder is right. Stn header rough 0.038, .adv 0.039.

44.518-4603.stn: rough 0.013, fine model 10,980 points, 21,956 faces, 0.0137 ct; second model 4,489 points 0.0147 ct. Same point and face counts and weight as fineRough on the Advisor saved copy; the direct point check needs the drive.
True 4603 model has 62 edges over 250 um; our decode had 520, so numbering was off after a gap. fineRough now prefers the small shift when two ways reach the same place. Local stones unchanged (402 still 8,990 of 8,993). Fix on 4603 itself not tested: the Advisor saved copy is on the drive.
fineRough, Nov 2026: stretches between gaps are numbered separately, because a later gap can restore the numbering. Advisor saved 4603 against its .stn: 10,973 of 10,980 points identical, the rest within 10.3 um, 21,939 of 21,956 faces, 62 long edges, same as the true model. 402 still 8,990 of 8,993.
Stn check: 4602 8,661 points 0.0203 ct, 154 long edges, as our decode. 4604 12,699 points 0.0155 ct, 84 long edges (ours 79 at last read; point check needs the Advisor copy). Stn header rough weight looks cut down and Advisor's rounded: 402 model 0.0388, stn 0.038, .adv 0.039; 4603 0.0137, 0.013, 0.014; 4604 0.0155, 0.015, 0.016. No planner change needed.

## PC findings, 7 Nov 2026 (FINDINGS.md from the PC session, read on the Mac)
Save As opens off screen: "Save Stone" stored at -32000, -32000 in AppData\Roaming\Sarin Technologies\Advisor\StonesDialog\UIConfiguration.xml, last written 6 Nov 19:31:17, so Advisor locks and looks frozen. Cause of the stored value not proven. Not fixed yet.
Each save also exports a CSV to \\server\GalaxyImport\Galaxy\19\ (ExportSettings.xml, After Save); test stones could overwrite a real stone's CSV of the same name. User decision needed.
Drive F: health status Warning in Windows. Script pre-check: the Load Stone folder box read blank in that test, so the folder check may refuse every stone. A second Advisor process with no window was running.
PC session flagged that the notes hold sections from earlier decompiling of Advisor's files. Not used by it.

User, 7 Nov: the Advisor exit at 00:30 was the user closing it by hand because it was stuck, not a crash. Minimizing while loading is still unexplained.
User, 7 Nov: the minimize while loading was also the user. Likely how Save As was lost: minimizing while the Save window is open can store -32000. Not proven.

PC Job 2, 7 Nov: advisor-resave-all worked on 3 stones: 401 ADV1 0.0074 ct, 402 ADV2 0.0087 ct, 404 ADV3 0.0116 ct (saw and pie). All reopened cleanly, stones selected, 3D showing. Originals unchanged. CSVs written under -ADV names only. Folder box reads blank, the path is in its tooltip: DirNow added in the PC copy of the script (autook/planner-for-advisor-pc), not yet in the Mac copy. Inclusion Projection not checked. Older CSVs on the server: 402-ADV1, 401-ADV2, 403-ADV2 would be overwritten at those counts. Load Stone rows show a delete icon on hover. The green "Save succeeded" popup is not a question.

## PC research, 7 Nov 2026: file structure (from the PC session's report, full text in F:\autook\pc-findings\FINDINGS.md)
File is a list of sections. Near the end: a directory (24 rows of 28 bytes: position, id, type, 2, 0, value, 1), then a size table (26 rows: 2, 0, c, 1, A, B). The last 44 bytes give where the tables are. Any length change must update them. Sections are cut into equal chunks of A bytes with c bytes removed per chunk; on-disk size = k x A; B is the real size. Removed bytes may be in a 12,577 byte block in section 25 that looks encrypted: PC session did not decode it, and we should not try to break it.
Plate block 2865304f: id, thickness, position, zero, direction, name. Cut group e1155c7a: one per plan, tree of nodes; pie = plate list + saw branch. Every plan run stays, then one stone record per Results row, each carrying its plan's plates; own plate -1 = inside the pie. Part IDs are a path, Ctrl+click on a Results row shows them.
Selection = saved list of Result IDs, section 15: real content 4 + 4n bytes (count, ids); the count is one of the removed bytes. Set by clicking rows, not the box. Pairs 8/16, 6/12, 4/8 = list size; a2/144, 36/6c, ffffff7f/0 = ticked plan's plates section size.
Working same-length edit: keep the list's size and repeat a stone, e.g. 28, 29, 26 to 29, 26, 26. 9 of 9 tests on 404, 276, 206, 402 opened clean, stones selected, 3D on, including moves to another plan (404 only). Save As from such a file rebuilds it correctly (4 checked, not reopened). Limits: ids must exist in the file; list can only go down. Header and plate section stay stale until Advisor saves.
Not tested: our own plans in these slots, Inclusion Projection, marking machine, real stone. 17 test CSVs on the server, J3-, J4-, J6- names, deletable. Tool: pc-findings/tools/mk2.py.

Block swap, 7 Nov (run by the user's mistaken yes, on test copies, 404 only): copying the 12,704 byte unreadable block from a 1, 2 or 3-stone save into a 3-stone copy made it open on 1, 2 or 3 stones, so the hidden count is in that block. Decision: do not use or build on this block. It may be a protection or signature, so moving it risks the rule against getting around protection. The repeat-a-stone edit leaves it alone. Files in pc-findings/job7.

Job 8, 7 Nov (404, from J3-Q3A, one stone only): TO2 (list 25, 24, 24, row 25 804.01 to 784.01 in all 7 copies) and TO1 (16, 16, 16, row 16 1259.17 to 1239.17) open with the right stones, 3D on, new diameter, no message, no hatched patch on the changed stone. TO2 Save As keeps the new diameter and rebuilds the list. Weight stays old even after Save As, so volume and weight must be written, as our writer already does for the current plan. Redo with volume and weight running.
TO2b, TO1b, 7 Nov (404, one stone): with diameter (7 places), volume (marker -114), weight (2 places, this layout), header 76, summary polish fields written, all open right with new weight and total, no patch on the changed stone. TO2b-saved keeps them, CSV Pw 0.0019. Still old: title 0.041 ct, header part weights, other Result fields. Next: full plan of ours in a slot (position, angles, proportions, saw). Need J3-Q3A, tools to.py, mk2.py, dia2.py on the Mac.
