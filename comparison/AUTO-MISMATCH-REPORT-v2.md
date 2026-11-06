# Our Auto select against Advisor's saved marks

196 stones, 103,925 inclusions. Same mark on 89,748 (86.4%), different on 14,177.

"Inside" means part of the inclusion is inside one of Advisor's polished stones; "deep" means 25 um or more inside, so it changes what a stone can be. Sizes are ours: the diagonal across the two longest box sides. Deepest = how far the deepest part is from the rough surface. Figures are 10th / median / 90th percentile.

## All marks

| Advisor \ ours | ignore | auto | use |
|---|---:|---:|---:|
| ignore | 29,518 | 183 | 6,344 |
| auto | 155 | 933 | 53 |
| use | 6,481 | 961 | 59,297 |

## Mismatches by cause

| Cause | Count | Inside Advisor stones | Deep inside | Size um | Deepest from surface um | Size class (band) |
|---|---:|---:|---:|---|---|---|
| A1 Advisor Ignore, ours Use: our skin rule sent a small inclusion back to Use | 5,798 | 44 | 14 | 5 / 29 / 123 | 25 / 50 / 100 | 0: 3946, 1: 848, 5: 637 |
| A2 Advisor Ignore, ours Use: bigger than the Auto top | 546 | 58 | 37 | 301 / 412 / 528 | 50 / 100 / 200 | 6: 194, 7: 169, 5: 103 |
| B1 Advisor Auto, ours Use: our skin rule sent it back to Use | 31 | 4 | 3 | 5 / 54 / 242 | 25 / 50 / 100 | 0: 17, 5: 11, 1: 2 |
| B2 Advisor Auto, ours Use: bigger than our Auto top | 22 | 10 | 10 | 201 / 335 / 398 | 75 / 200 / 300 | 5: 17, 6: 4, 7: 1 |
| C1 Advisor Use, ours Ignore: small by our size, not in our skin | 6,479 | 0 | 0 | 5 / 26 / 108 | 125 / 150 / 300 | 0: 4080, 1: 817, : 696 |
| C2 Advisor Use, ours Auto: in our Auto range, not in our skin | 493 | 5 | 0 | 214 / 256 / 329 | 125 / 150 / 500 | 5: 399, 6: 77, : 16 |
| C3 Advisor Use, ours Auto crown only: between TABLE CTR+ and CROWN+ | 468 | 6 | 0 | 238 / 270 / 362 | 125 / 200 / 500 | 5: 316, 6: 147, 7: 3 |
| D1 Advisor Auto, ours Ignore: at or below 201 by our size | 155 | 27 | 20 | 173 / 189 / 198 | 125 / 300 / 1000 | 5: 154, 0: 1 |
| D2 Advisor Ignore, ours Auto: in our Auto range | 133 | 22 | 16 | 204 / 227 / 320 | 125 / 200 / 500 | 5: 114, 6: 12, 255: 5 |
| D3 Advisor Ignore, ours Auto crown only: between TABLE CTR+ and CROWN+ | 50 | 6 | 6 | 214 / 262 / 354 | 125 / 150 / 300 | 5: 38, 6: 10, 7: 2 |
| X use/ignore/other | 2 | 0 | 0 | 271 / 271 / 271 | 50 / 50 / 50 | 5: 2 |

## Mismatches that change planning

- We block, Advisor kept inside its stone (25 um or deeper): 64 inclusions on 34 stones. These cost us size.
- We allow, Advisor marked Use: 7,442 inclusions, 11 of them inside Advisor stones. These can give us bigger stones than Advisor would allow.

## Rule checks

- Small inclusions (our size up to Ignore limit): skin distance 25 um would match 53.8% of Advisor's Use/Ignore marks.
- Small inclusions (our size up to Ignore limit): skin distance 50 um would match 71.7% of Advisor's Use/Ignore marks.
- Small inclusions (our size up to Ignore limit): skin distance 75 um would match 80.7% of Advisor's Use/Ignore marks.
- Small inclusions (our size up to Ignore limit): skin distance 100 um would match 86.8% of Advisor's Use/Ignore marks.
- Small inclusions (our size up to Ignore limit): skin distance 125 um would match 87.4% of Advisor's Use/Ignore marks.
- Small inclusions (our size up to Ignore limit): skin distance 150 um would match 85.9% of Advisor's Use/Ignore marks.
- Small inclusions (our size up to Ignore limit): skin distance 200 um would match 81.1% of Advisor's Use/Ignore marks.
- Auto size range: skin distance 50 um would match 48.3% of Advisor's Use/Auto marks.
- Auto size range: skin distance 75 um would match 66.3% of Advisor's Use/Auto marks.
- Auto size range: skin distance 100 um would match 77.1% of Advisor's Use/Auto marks.
- Auto size range: skin distance 125 um would match 80.2% of Advisor's Use/Auto marks.
- Auto size range: skin distance 150 um would match 81.9% of Advisor's Use/Auto marks.
- Auto size range: skin distance 200 um would match 82.4% of Advisor's Use/Auto marks.

Advisor Use/Ignore by our size, small inclusions not in our skin (does Advisor's Ignore limit differ from 201?):

| Our size um | Advisor ignore | Advisor use | Advisor auto |
|---|---:|---:|---:|
| 0-100 | 26,926 | 5,751 | 1 |
| 100-150 | 1,749 | 429 | 6 |
| 150-180 | 621 | 168 | 21 |
| 180-201 | 211 | 114 | 130 |
| 201-230 | 84 | 143 | 310 |
| 230-260 | 36 | 253 | 256 |
| 260-300 | 35 | 423 | 208 |
| 300-361 | 68 | 871 | 147 |
| 361-450 | 89 | 1,499 | 15 |
| 450- | 99 | 2,688 | 0 |

Advisor Auto rate by size class byte (band) and our size, inclusions not in our skin:

| Band | Count | Auto | Use | Ignore | Our size um |
|---|---:|---:|---:|---:|---|
| 0 | 26,567 | 1 | 4,085 | 22,481 | 5 / 13 / 37 |
| 1 | 4,406 | 0 | 815 | 3,591 | 49 / 62 / 83 |
| 2 | 704 | 0 | 149 | 555 | 82 / 92 / 103 |
| 3 | 577 | 0 | 100 | 477 | 91 / 102 / 115 |
| 4 | 507 | 0 | 103 | 404 | 99 / 110 / 125 |
| 5 | 4,849 | 1,083 | 1,721 | 2,045 | 127 / 196 / 309 |
| 6 | 1,627 | 10 | 1,524 | 93 | 332 / 381 / 435 |
| 7 | 1,499 | 0 | 1,412 | 87 | 417 / 468 / 522 |
| 8 | 938 | 0 | 908 | 30 | 487 / 542 / 608 |
| 9 | 389 | 0 | 381 | 8 | 565 / 639 / 696 |
| 10 | 185 | 0 | 182 | 3 | 630 / 707 / 774 |
| 255 | 317 | 0 | 178 | 139 | 17 / 216 / 862 |
|  | 781 | 0 | 781 | 0 | 6 / 23 / 273 |

## By rough weight row

| Row (ct x 100) | Stones | Inclusions | Same | Deep inside, we block |
|---|---:|---:|---:|---:|
| 2 | 5 | 2,072 | 75.7% | 1 |
| 3 | 29 | 12,204 | 86.3% | 8 |
| 4 | 72 | 36,169 | 85.9% | 36 |
| 5 | 44 | 25,944 | 87.3% | 9 |
| 6 | 31 | 18,709 | 88.7% | 6 |
| 7 | 7 | 3,342 | 71.8% | 0 |
| 8 | 5 | 2,781 | 86.3% | 4 |
| 9 | 2 | 907 | 92.0% | 0 |
| 10 | 1 | 1,797 | 94.9% | 0 |

## Stones with most planning mismatches

| Stone | We block (deep inside Advisor) | Inclusions (id, size, Advisor, our reason, depth) |
|---|---:|---|
| 1.S525-264 | 8 | 191 32um auto skin_back_to_use 37um; 206 450um auto size_over_auto_top 30um; 277 142um auto skin_back_to_use 61um; 282 461um auto size_over_auto_top 57um; 303 377um auto size_over_auto_top 63um; 307 296um auto size_over_auto_top 74um; 316 5um auto skin_back_to_use 55um; 338 335um auto size_over_auto_top 72um |
| 1.S525-475 | 6 | 17 286um ignore size_over_auto_top 137um; 18 304um ignore size_over_auto_top 25um; 21 376um ignore size_over_auto_top 132um; 86 515um ignore size_over_auto_top 43um; 91 8um ignore skin_back_to_use 35um; 143 520um ignore size_over_auto_top 138um |
| 1.S525-257 | 4 | 22 467um ignore size_over_auto_top 31um; 31 446um ignore size_over_auto_top 70um; 87 517um ignore size_over_auto_top 63um; 367 407um ignore size_over_auto_top 33um |
| 1.S525-424 | 4 | 201 87um ignore skin_back_to_use 25um; 264 359um ignore size_over_auto_top 79um; 288 75um ignore skin_back_to_use 25um; 296 5um ignore skin_back_to_use 29um |
| 1.S525-410 | 3 | 256 151um ignore skin_back_to_use 29um; 694 117um ignore skin_back_to_use 69um; 712 5um ignore skin_back_to_use 33um |
| 1.S525-434 | 3 | 50 308um ignore size_over_auto_top 38um; 86 81um ignore skin_back_to_use 49um; 272 434um ignore size_over_auto_top 40um |
| 1.S525-474 | 3 | 309 479um ignore size_over_auto_top 44um; 356 494um ignore size_over_auto_top 43um; 458 187um ignore skin_back_to_use 31um |
| 1.S525-231 | 2 | 78 458um ignore size_over_auto_top 114um; 79 514um ignore size_over_auto_top 115um |
| 1.S525-245 | 2 | 57 22um ignore skin_back_to_use 44um; 182 202um ignore size_over_auto_top 223um |
| 1.S525-250 | 2 | 15 503um ignore size_over_auto_top 65um; 186 619um ignore size_over_auto_top 137um |
| 1.S525-285 | 2 | 138 452um ignore size_over_auto_top 68um; 403 5um ignore skin_back_to_use 27um |
| 1.S525-407 | 2 | 183 270um ignore skin_back_to_use 25um; 222 361um ignore size_over_auto_top 52um |
| 1.S525-435 | 2 | 312 408um ignore size_over_auto_top 133um; 334 303um ignore size_over_auto_top 186um |
| 1.S525-212 | 1 | 719 323um ignore size_over_auto_top 38um |
| 1.S525-215 | 1 | 287 465um ignore size_over_auto_top 42um |
| 1.S525-217 | 1 | 134 351um ignore size_over_auto_top 31um |
| 1.S525-221 | 1 | 148 832um ignore size_over_auto_top 25um |
| 1.S525-238 | 1 | 142 597um ignore size_over_auto_top 31um |
| 1.S525-253 | 1 | 622 516um ignore size_over_auto_top 32um |
| 1.S525-256 | 1 | 519 49um ignore skin_back_to_use 25um |
| 1.S525-273 | 1 | 58 474um ignore size_over_auto_top 31um |
| 1.S525-275 | 1 | 1016 398um auto size_over_auto_top 84um |
| 1.S525-289 | 1 | 143 439um ignore size_over_auto_top 44um |
| 1.S525-405 | 1 | 633 588um ignore size_over_auto_top 30um |
| 1.S525-412 | 1 | 669 599um ignore size_over_auto_top 25um |

Full list: auto-mismatches.csv (one row per mismatched inclusion, with cause).
