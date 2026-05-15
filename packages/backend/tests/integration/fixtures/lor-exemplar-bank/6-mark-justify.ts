import type { ExemplarQuestion } from "./types"

export const SIX_MARK_JUSTIFY_QUESTIONS: ExemplarQuestion[] = [
	{
		id: "techfix-q1",
		businessName: "TechFix Mobile Repairs",
		businessContext: "Phone and tablet repair shop in a shopping centre.",
		questionText:
			"TechFix is considering offering a 'one-hour express repair' service for an additional fee. Justify whether this is a good decision.",
		totalMarks: 6,
		commandWord: "Justify",
		templateKey: "aqa-6-mark-justify",
		indicativeContent:
			"Strong answers balance the appeal of express service (busy customers, higher margins via additional fee, differentiation in a shopping centre) against operational risk (complex repairs that overrun the promised hour, technician pressure, reputational damage from missed deadlines, parts availability). The judgement should be conditional — 'beneficial if limited to common faults like screen/battery swaps; risky if applied to all repairs'.",
		answers: [
			{
				id: "L1",
				text: "Doing a one hour repair could make TechFix more money because people might want their phones fixed quickly. But it could be bad too because it might be stressful for the staff and they might rush the job. I think they should try it but it might not work well.",
				expected: { level: 1, markMin: 1, markMax: 2, isTrap: false },
				whyNotes: [
					"Very simple statements",
					"No context beyond 'phones'",
					"No proper chain of reasoning",
					"No judgement linked to analysis",
					"Weak AO2",
				],
			},
			{
				id: "L2",
				text: "One benefit of offering a one-hour express repair is that TechFix could attract customers who need their phone urgently for work or travel. This means they could charge a higher price and increase revenue.\nHowever, repairs often depend on spare parts and how complicated the damage is. If the business promises a one-hour service but the repair takes longer, customers might complain, which harms TechFix's reputation. It also puts pressure on the technicians, which could lead to mistakes.\nOverall, I think it could be a good idea, but only for common repairs that TechFix can complete quickly.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: false },
				whyNotes: [
					"AO1 correct",
					"AO2 partially applied (urgent repairs, technicians)",
					"AO3-lite with basic judgement",
					"Not detailed enough for L3",
					"No strong contextual evaluation",
				],
			},
			{
				id: "L3",
				text: "One advantage of offering a one-hour express repair service is that it allows TechFix to differentiate itself from competitors in the shopping centre. Many customers rely heavily on their phones for work, socialising and payments, so the promise of a fast repair could encourage more people to choose TechFix, increasing revenue. Charging an additional fee also boosts profit margins, meaning each job becomes more profitable without needing to increase the number of repairs completed.\nHowever, express repairs may only be realistic for simple issues such as screen replacements or battery swaps. More complex repairs require diagnostics or specialist parts, and failing to complete them within the promised time could lead to customer complaints and refunds. This could damage TechFix's reputation, especially if unhappy customers post negative reviews online.\nOverall, the decision is beneficial if TechFix limits the one-hour service to straightforward repairs they can reliably complete. If they apply it to all repairs, the risk of disappointing customers outweighs the potential benefit. Therefore, the decision depends on the type of repairs they offer and the skills of their technicians.",
				expected: { level: 3, markMin: 5, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 accurate",
					"AO2 well-applied (shopping centre, simple repairs, negative reviews)",
					"AO3: clear reasoning, mini-balance, conditional judgement",
					"Realistic length for top-band",
				],
			},
			{
				id: "Fake-L3",
				text: "Offering a one-hour repair is good because customers like fast services and it makes TechFix look more professional. This could help them get more sales since people want their phones back as soon as possible. It could also attract new customers who are in a hurry.\nThe only problem is that it might be stressful for the staff and sometimes it might take longer than expected. If that happens customers will be annoyed and might leave bad reviews. So it has risks as well.\nOverall I think TechFix should offer the one-hour repair because most customers will be happy with it and it will make the business more popular.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: true },
				whyNotes: [
					"Looks polished… but shallow",
					"AO2 is generic ('customers like fast services')",
					"Weak reasoning",
					"No deep analysis",
					"No genuine 'it depends'",
					"Judgement not justified",
					"→ Capped at Level 2",
				],
			},
		],
	},
	{
		id: "ecowash-q1",
		businessName: "EcoWash Home Laundry Service",
		businessContext:
			"Eco-friendly home laundry collection and delivery service.",
		questionText:
			"EcoWash is considering offering a free collection and delivery service for laundry orders over £20. Justify whether this is a good decision.",
		totalMarks: 6,
		commandWord: "Justify",
		templateKey: "aqa-6-mark-justify",
		indicativeContent:
			"Strong answers weigh customer convenience and larger basket sizes (£20 minimum keeps each job profitable) against operating-cost increase (fuel, insurance, driver wages, time per route). The judgement should depend on customer density (short distances ↔ profitable; spread-out customers ↔ costs outweigh revenue) and typical order size.",
		answers: [
			{
				id: "L1",
				text: "Offering free collection and delivery is good because more people might use the service since it's easier. But it could be bad because EcoWash will have to pay for petrol and this costs money. It might help them get more customers but they could also lose money if it costs too much. I think they should try it.",
				expected: { level: 1, markMin: 1, markMax: 2, isTrap: false },
				whyNotes: [
					"Very simple statements",
					"AO1 basic; AO2 thin",
					"No real chain of reasoning",
					"Judgement unjustified",
				],
			},
			{
				id: "L2",
				text: "Offering free collection and delivery for orders over £20 could help EcoWash attract busy customers who do not have time to visit the shop. This makes the service more convenient and could help increase sales.\nHowever, EcoWash will have higher fuel and staff costs because someone has to drive to customers' houses. If lots of customers live far away, the business might spend more on petrol than it earns from the extra orders.\nOverall, I think it is a good idea if EcoWash has many customers living close by, but it might be risky if they have to travel long distances.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: false },
				whyNotes: [
					"AO1 correct",
					"AO2 partially applied",
					"Some evaluation but shallow",
					"Judgement basic",
					"Reasoning underdeveloped",
				],
			},
			{
				id: "L3",
				text: "Offering free collection and delivery for orders over £20 could make EcoWash far more attractive to customers who value convenience. Many people with busy schedules, such as parents and office workers, prefer services that save time. By removing the need for customers to travel to the shop, EcoWash may see an increase in larger orders, helping to raise revenue. The £20 minimum also ensures each job remains profitable.\nHowever, offering free collection and delivery significantly increases EcoWash's operating costs. The business must cover fuel, insurance and vehicle maintenance, as well as driver wages. If many customers live far apart, the time spent travelling between homes could reduce the number of orders EcoWash can complete each day. In this case, the higher costs could outweigh any increase in sales.\nOverall, the decision is beneficial if most customers are located within a short distance of the shop and place orders above the £20 threshold regularly. If customers are spread out geographically, the costs may be too high. The final decision therefore depends on EcoWash's customer density and typical order size.",
				expected: { level: 3, markMin: 5, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 accurate",
					"AO2 well-applied (parents, office workers, density, £20 threshold)",
					"Multi-step chains; balanced",
					"Conditional 'it depends' judgement",
				],
			},
			{
				id: "Fake-L3",
				text: "EcoWash should definitely offer free collection and delivery because it makes the business more convenient. Customers will like not having to go to the shop and this means more orders. It also makes the business look modern and customer-friendly which could improve its reputation.\nThe only issue is that it costs more for EcoWash because of fuel and the driver. This might make the business lose money if the deliveries take a long time.\nOverall it is still a good idea because people like services that save time and it will help EcoWash stand out from competitors.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: true },
				whyNotes: [
					"superficial, vague reasoning",
					"no detailed AO2",
					"no developed chain-of-reasoning",
					"judgement is generic",
					"missing real conditional evaluation",
					"→ Capped at L2",
				],
			},
		],
	},
]
