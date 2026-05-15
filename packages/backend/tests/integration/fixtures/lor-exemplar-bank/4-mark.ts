import type { ExemplarQuestion } from "./types"

export const FOUR_MARK_QUESTIONS: ExemplarQuestion[] = [
	{
		id: "freshblend-q1",
		businessName: "FreshBlend Smoothie Bar",
		businessContext: "Smoothie/juice bar in a busy town centre.",
		questionText:
			"Explain two ways FreshBlend Smoothie Bar could increase customer footfall.",
		totalMarks: 4,
		commandWord: "Explain",
		templateKey: "aqa-4-mark",
		indicativeContent:
			"Strong answers identify two distinct, business-specific ways to increase footfall and develop each into a multi-step chain of reasoning — e.g. loyalty card → repeat visits → loyal customer base in a competitive town centre; free samples outside shop → passers-by try the product → converted into paying customers (especially effective for taste-led smoothie purchases). Generic ideas like 'better products' or 'nicer shop' do not show AO2 application and should not reach Level 3.",
		answers: [
			{
				id: "L1",
				text: "One way is they can make better smoothies so more people come. Another way is they can make their shop look nicer. This will help the business because customers like good shops.",
				expected: { level: 1, markMin: 1, markMax: 2, isTrap: false },
				whyNotes: [
					"generic ('better smoothies', 'nicer shop')",
					"no development",
					"no context",
					"vague, repetitive",
					"no real chain of reasoning",
				],
			},
			{
				id: "L2",
				text: "One way FreshBlend could increase footfall is by offering limited-time seasonal smoothies like a summer berry drink. This might attract customers who want something new.\nA second way is giving discounts during quiet hours, encouraging more people to visit when the shop is usually empty.",
				expected: { level: 2, markMin: 2, markMax: 3, isTrap: false },
				whyNotes: [
					"Clear AO1",
					"Reasonable AO2 (summer drinks, quiet hours)",
					"Limited development",
					"Both points underdeveloped",
					"Not fully explained → doesn't reach L3",
				],
			},
			{
				id: "L3",
				text: "One way FreshBlend Smoothie Bar could increase customer footfall is by introducing a loyalty card scheme. For example, customers could receive a free drink after purchasing five smoothies. This encourages repeat visits by giving customers an incentive to return, helping the business build a loyal customer base in a competitive town centre.\nA second way is to offer free samples outside the shop during busy periods. When people walking past try a sample, they may be encouraged to come inside and purchase a full drink. This is particularly effective for a smoothie bar because customers often choose based on taste. By increasing the number of people who stop and try a product, FreshBlend can convert casual passers-by into paying customers.",
				expected: { level: 3, markMin: 4, markMax: 4, isTrap: false },
				whyNotes: [
					"Two fully developed points",
					"Explicit application to the business",
					"Clear chains of reasoning",
					"Fully meets the maximum Level 3 standard",
				],
			},
			{
				id: "Fake-L3",
				text: "FreshBlend could post more pictures on social media. This helps people see their smoothies and want to come in. They could also lower prices during the week so more customers visit. This will increase footfall and make the shop busier.",
				expected: { level: 2, markMin: 2, markMax: 3, isTrap: true },
				whyNotes: [
					"Looks clean, but generic",
					"shallow reasoning",
					"weak AO2",
					"'post pictures' = undeveloped",
					"no chains",
					"no real application",
					"→ Capped at L2",
				],
			},
		],
	},
]
