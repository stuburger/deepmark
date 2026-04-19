import type { PageToken } from "../../../types"

/**
 * Q02 tokens from production submission `cmo67pmym000002juduby8kc3`
 * (Subhaan Baig, AQA Business 8132/2).
 *
 * This is a 12-mark extended writing answer. Cloud Vision fragments the
 * handwriting into many single-word paragraphs and its native
 * `(para_index, line_index, word_index)` ordering diverges from the actual
 * spatial reading order in ~6 places on page 6. The attribution LLM authored
 * `ANSWER_TEXT` in spatial reading order, so any downstream alignment must
 * walk tokens in the same order to match them correctly.
 *
 * See `q02-alignment.test.ts` for the regression this fixture guards.
 */

type FixtureToken = Pick<
	PageToken,
	"id" | "page_order" | "text_raw" | "text_corrected" | "bbox"
>

/**
 * Inflate compact fixture entries into the fields needed for alignment.
 * `para_index`/`line_index`/`word_index`/`question_id` etc. are not used
 * by the alignment path, so we fill them with stable placeholders.
 */
function mk(
	id: string,
	page: number,
	raw: string,
	corrected: string | null,
	bbox: [number, number, number, number],
): FixtureToken {
	return {
		id,
		page_order: page,
		text_raw: raw,
		text_corrected: corrected,
		bbox,
	}
}

export const Q02_ANSWER_TEXT =
	"I think that the most profitable option for Jim and Quality Wallpaper Ltd is to franchise. This is because it will help him maintain sufficient profit as well as help to raise finance for the business. When he franchises his business, it will increase reputation as more people can find out about it which means more profit. There is of course a downside to this franchising as he could also get a worse reputation as if one franchise gets a bad reputation, then the whole business could get a bad reputation and they will lose out on money. But despite that I still think that this is the best option as different franchises could have different skills so they can improve the business. This will reduce costs as he won't need to invest in the home decorating business himself and he can stay focusing on his wallpaper sector of the business."

/**
 * All 149 tokens attributed to Q02, ordered as the client receives them from
 * `db.studentPaperPageToken.findMany` without an `orderBy` clause, which in
 * practice matches Vision's `(para_index, line_index, word_index)` ordering.
 *
 * Pulled from production on 2026-04-19.
 */
export const Q02_TOKENS_PARA_ORDER: FixtureToken[] = [
	mk("t1", 5, "I", null, [802, 79, 817, 98]),
	mk("t2", 5, "think", null, [796, 137, 816, 197]),
	mk("t3", 5, "Mut", "that", [796, 242, 813, 298]),
	mk("t4", 5, "Me", "the", [791, 346, 815, 384]),
	mk("t5", 5, "most", null, [790, 418, 814, 492]),
	mk("t6", 5, "profitable", null, [790, 530, 823, 669]),
	mk("t7", 5, "ophon", "option", [796, 711, 816, 801]),
	mk("t8", 5, "for", null, [833, 128, 849, 169]),
	mk("t9", 5, "Jim", null, [837, 222, 850, 269]),
	mk("t10", 5, "and", null, [835, 339, 848, 380]),
	mk("t11", 5, "audity", null, [831, 427, 880, 554]),
	mk("t12", 5, "wall", null, [831, 596, 846, 661]),
	mk("t13", 5, "·", null, [839, 659, 852, 668]),
	mk("t14", 5, "puper", "Quality", [837, 666, 852, 737]),
	mk("t15", 6, "is", null, [175, 128, 186, 155]),
	mk("t16", 6, "to", null, [172, 212, 186, 238]),
	mk("t17", 6, "franchise", null, [166, 285, 185, 409]),
	mk("t18", 6, "This", null, [172, 452, 188, 510]),
	mk("t19", 6, "is", null, [178, 554, 186, 573]),
	mk("t20", 6, "because", null, [167, 608, 187, 705]),
	mk("t21", 6, "it", null, [172, 746, 183, 766]),
	mk("t22", 6, "mill", "will", [172, 824, 182, 874]),
	mk("t23", 6, "hel", "help", [204, 122, 221, 167]),
	mk("t24", 6, "him", null, [203, 214, 218, 260]),
	mk("t25", 6, "maintai", "maintain", [202, 298, 222, 407]),
	mk("t26", 6, "sufficient", null, [202, 479, 222, 593]),
	mk("t27", 6, "profit", null, [202, 633, 222, 718]),
	mk("t28", 6, "well", null, [204, 841, 218, 892]),
	mk("t29", 6, "as", null, [244, 130, 255, 157]),
	mk("t30", 6, "help", null, [234, 203, 256, 255]),
	mk("t31", 6, "h", null, [236, 292, 248, 305]),
	mk("t32", 6, "raise", null, [237, 346, 253, 415]),
	mk("t33", 6, "Finance", null, [234, 453, 253, 541]),
	mk("t34", 6, "for", null, [234, 570, 253, 614]),
	mk("t35", 6, "the", null, [234, 642, 253, 672]),
	mk("t36", 6, "business", null, [234, 692, 254, 817]),
	mk("t37", 6, "Wen", null, [270, 127, 287, 173]),
	mk("t38", 6, "he", null, [271, 212, 288, 240]),
	mk("t39", 6, "franchises", null, [271, 275, 292, 391]),
	mk("t40", 6, "his", null, [269, 433, 287, 478]),
	mk("t41", 6, "business", null, [271, 522, 286, 625]),
	mk("t42", 6, ".", null, [272, 616, 285, 628]),
	mk("t43", 6, "it", null, [270, 671, 286, 691]),
	mk("t44", 6, "will", null, [269, 723, 285, 775]),
	mk("t45", 6, "vense", "increase", [275, 826, 287, 907]),
	mk("t46", 6, "reputation", null, [309, 139, 324, 254]),
	mk("t47", 6, ".", null, [310, 241, 323, 257]),
	mk("t48", 6, "a", null, [312, 298, 322, 315]),
	mk("t49", 6, "S", null, [311, 321, 321, 331]),
	mk("t50", 6, "hove", "people", [311, 390, 323, 449]),
	mk("t51", 6, "con", "can", [314, 611, 323, 648]),
	mk("t52", 6, "Cond", "find", [305, 683, 324, 746]),
	mk("t53", 6, "ot", "out", [311, 792, 324, 835]),
	mk("t54", 6, "about", null, [342, 143, 358, 209]),
	mk("t55", 6, "it", null, [343, 249, 356, 269]),
	mk("t56", 6, "which", null, [338, 309, 357, 369]),
	mk("t57", 6, "ven", "means", [346, 407, 357, 453]),
	mk("t58", 6, "s", null, [346, 469, 355, 485]),
	mk("t59", 6, "more", null, [346, 538, 357, 603]),
	mk("t60", 6, "is", null, [378, 148, 389, 168]),
	mk("t61", 6, "of", null, [376, 214, 392, 248]),
	mk("t62", 6, "course", null, [376, 252, 394, 333]),
	mk("t63", 6, "a", null, [382, 380, 391, 398]),
	mk("t64", 6, "downside", null, [378, 436, 396, 551]),
	mk("t65", 6, "to", null, [375, 594, 390, 617]),
	mk("t66", 6, "Profit", null, [336, 646, 363, 737]),
	mk("t67", 6, "this", null, [368, 667, 395, 723]),
	mk("t68", 6, "french", "franchising", [370, 743, 399, 833]),
	mk("t69", 6, "sing", null, [373, 822, 400, 879]),
	mk("t70", 6, ".", null, [376, 881, 401, 900]),
	mk("t71", 6, "There", null, [339, 797, 357, 851]),
	mk("t72", 6, "as", null, [415, 136, 426, 163]),
	mk("t73", 6, "could", null, [409, 263, 429, 327]),
	mk("t74", 6, "also", null, [411, 363, 428, 402]),
	mk("t75", 6, "wouse", "worse", [414, 597, 429, 683]),
	mk("t76", 6, "antation", "reputation", [405, 760, 424, 856]),
	mk("t77", 6, "a", null, [449, 142, 459, 154]),
	mk("t78", 6, "5", null, [448, 157, 459, 168]),
	mk("t79", 6, "C", null, [443, 240, 457, 255]),
	mk("t80", 6, "one", null, [449, 300, 459, 344]),
	mk("t81", 6, "franchise", null, [441, 397, 458, 515]),
	mk("t82", 6, "bnd", "bad", [441, 736, 456, 785]),
	mk("t83", 6, "reputation", null, [474, 136, 494, 266]),
	mk("t84", 6, "bud", "bad", [506, 201, 525, 254]),
	mk("t85", 6, "reputation", null, [510, 297, 527, 401]),
	mk("t86", 6, "on", null, [553, 145, 561, 169]),
	mk("t87", 6, "mo", "money", [547, 213, 560, 255]),
	mk("t88", 6, "May", "then", [474, 331, 494, 370]),
	mk("t89", 6, "the", null, [474, 404, 493, 449]),
	mk("t90", 6, "whole", null, [473, 476, 493, 547]),
	mk("t91", 6, ".", null, [473, 539, 492, 551]),
	mk("t92", 6, "But", null, [541, 369, 559, 416]),
	mk("t93", 6, "despite", null, [541, 446, 559, 576]),
	mk("t94", 6, "business", null, [470, 586, 492, 699]),
	mk("t95", 6, "could", null, [476, 736, 495, 817]),
	mk("t96", 6, "get", null, [477, 843, 496, 892]),
	mk("t97", 6, "ad", "and", [514, 458, 524, 508]),
	mk("t98", 6, "Mey", "they", [508, 550, 525, 591]),
	mk("t99", 6, "lose", null, [508, 738, 523, 799]),
	mk("t100", 6, "out", null, [513, 840, 522, 887]),
	mk("t101", 6, "Mal", "that", [541, 619, 557, 667]),
	mk("t102", 6, "7", "I", [545, 714, 556, 725]),
	mk("t103", 6, "shill", "still", [536, 768, 557, 823]),
	mk("t104", 6, "Rom", "think", [540, 843, 560, 895]),
	mk("t105", 6, "Mat", "that", [580, 132, 595, 190]),
	mk("t106", 6, "Ms", "this", [577, 230, 589, 276]),
	mk("t107", 6, ".5", null, [582, 326, 591, 345]),
	mk("t108", 6, "M", "the", [574, 387, 589, 412]),
	mk("t109", 6, "best", null, [576, 461, 593, 523]),
	mk("t110", 6, "option", null, [575, 569, 594, 643]),
	mk("t111", 6, "GS", "as", [583, 700, 591, 732]),
	mk("t112", 6, "diffier", "different", [575, 766, 591, 868]),
	mk("t113", 6, "hardses", "franchises", [616, 145, 629, 274]),
	mk("t114", 6, "could", null, [616, 317, 630, 385]),
	mk("t115", 6, "have", null, [609, 430, 628, 483]),
	mk("t116", 6, "different", null, [611, 516, 631, 622]),
	mk("t117", 6, "shills", "skills", [608, 666, 627, 755]),
	mk("t118", 6, "so", null, [608, 780, 627, 816]),
	mk("t119", 6, "her", "they", [608, 837, 627, 879]),
	mk("t120", 6, "M", "improve", [647, 415, 660, 431]),
	mk("t121", 6, "ca", "can", [654, 149, 666, 182]),
	mk("t122", 6, "dice", "will", [679, 155, 695, 222]),
	mk("t123", 6, "busiess", "business", [644, 485, 661, 610]),
	mk("t124", 6, ".", null, [646, 616, 660, 630]),
	mk("t125", 6, "This", null, [645, 661, 659, 718]),
	mk("t126", 6, "to", "as", [674, 828, 688, 852]),
	mk("t127", 6, "iwest", "he", [715, 149, 731, 240]),
	mk("t128", 6, "as", "reduce", [686, 408, 694, 439]),
	mk("t129", 6, "he", "won't", [714, 384, 727, 418]),
	mk("t130", 6, "home", "need", [713, 481, 731, 580]),
	mk("t131", 6, "need", "costs", [683, 702, 693, 786]),
	mk("t132", 6, "decor", "to", [713, 628, 728, 715]),
	mk("t133", 6, "bus", "invest", [754, 159, 766, 208]),
	mk("t134", 6, ".", "in", [754, 201, 766, 217]),
	mk("t135", 6, "45", "the", [754, 213, 766, 259]),
	mk("t136", 6, "3", "home", [754, 270, 766, 287]),
	mk("t137", 6, "himself", "decorating", [743, 329, 764, 471]),
	mk("t138", 6, "Chudl", "business", [749, 515, 762, 574]),
	mk("t139", 6, "Le", "himself", [744, 619, 760, 645]),
	mk("t140", 6, "can", "and", [753, 702, 761, 751]),
	mk("t141", 6, "stay", "he", [743, 791, 766, 884]),
	mk("t142", 6, "on", "can", [787, 386, 797, 424]),
	mk("t143", 6, "his", "stay", [779, 470, 796, 524]),
	mk("t144", 6, "wallpaper", "focusing", [781, 576, 797, 762]),
	mk("t145", 6, ".", "on", [783, 749, 797, 766]),
	mk("t146", 6, "sector", "his", [777, 799, 794, 890]),
	mk("t147", 6, "of", "wallpaper", [819, 183, 835, 211]),
	mk("t148", 6, "he", "sector", [817, 298, 831, 332]),
	mk("t149", 6, "business", "of", [814, 398, 832, 523]),
]
