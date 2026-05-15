import type { ExemplarQuestion } from "./types"

export const SIX_MARK_ANALYSE_QUESTIONS: ExemplarQuestion[] = [
	{
		id: "petpal-q1",
		businessName: "PetPal Grooming",
		businessContext: "Mobile pet grooming service.",
		questionText:
			"Analyse two benefits to PetPal Grooming of offering a mobile home-visit service.",
		totalMarks: 6,
		commandWord: "Analyse",
		templateKey: "aqa-6-mark-analyse",
		indicativeContent:
			"Strong answers develop two business-specific benefits with multi-step consequences — e.g. removes transport stress for elderly owners / large-dog households → broader customer base → competitive advantage; eliminates premises rent → lower fixed costs → higher profit margins / cash-flow stability. No evaluation required: judgement is not necessary at any Level.",
		answers: [
			{
				id: "L1",
				text: "One benefit is customers don't have to travel so it's easier for them. This could make more people want to use PetPal. Another benefit is it might make the business look better because it goes to people's houses. This helps the business because it is more convenient. These are good things for PetPal Grooming.",
				expected: { level: 1, markMin: 1, markMax: 2, isTrap: false },
				whyNotes: [
					"vague",
					"no chains of reasoning",
					"minimal AO2 (nothing about pets, equipment, households)",
					"ideas repeated",
					"no developed consequences",
				],
			},
			{
				id: "L2",
				text: "One benefit of a mobile service is that PetPal can reach customers who don't have time to travel to a grooming shop. This means busy pet owners may choose PetPal because it saves them time, which can increase the number of bookings.\nA second benefit is that PetPal does not need to pay rent for a physical shop. This reduces fixed costs and could increase profit. They only need to pay for the van and fuel.\nThese are useful benefits because they help PetPal attract more customers and keep costs lower.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: false },
				whyNotes: [
					"Some AO2 (busy pet owners)",
					"Two points developed",
					"Reasoning not fully extended",
					"Conclusions short",
					"Good, but not enough depth for L3",
				],
			},
			{
				id: "L3",
				text: "One benefit of offering a mobile home-visit service is that PetPal Grooming can attract customers who struggle to travel, such as elderly pet owners or people with large dogs. By visiting customers at home, the business removes the inconvenience of transporting pets, which is often stressful for animals. This convenience can make PetPal more appealing than a traditional grooming shop, increasing demand and helping the business build a strong customer base.\nA second benefit is that operating as a mobile service reduces overhead costs. PetPal does not need to rent a physical premises or pay for utilities, which keeps fixed costs low. The business only needs to cover fuel, vehicle insurance and equipment maintenance. Lower overheads mean a greater proportion of each grooming fee becomes profit, improving cash flow and financial stability.\nThese benefits are significant because they help PetPal attract a wider range of customers while keeping costs under control, which can make the business more competitive.",
				expected: { level: 3, markMin: 5, markMax: 6, isTrap: false },
				whyNotes: [
					"Deep AO2 (elderly owners, large dogs, travel stress)",
					"Strong chains of reasoning",
					"Multiple developed consequences",
					"Correct length for authentic 6/6",
					"No evaluation (correct for this question)",
				],
			},
			{
				id: "Fake-L3",
				text: "A mobile grooming service is a good idea because customers will like that PetPal comes to their home. This makes things easier and could help them get more bookings from people who are too busy to travel. It also makes the business look more modern and professional.\nAnother benefit is that they won't have to pay rent for a shop which saves money. This means more profit for the business and they can spend the money on better equipment.\nThese benefits show that mobile grooming is great for PetPal and helps the business grow.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: true },
				whyNotes: [
					"AO2 shallow ('people are busy' repeated)",
					"Consequences vague",
					"No multi-step chains",
					"No specific pet-related context",
					"'Looks professional' = fluff",
					"Too neat, not deep",
					"→ Capped at L2",
				],
			},
		],
	},
	{
		id: "cleanwave-q1",
		businessName: "CleanWave Car Valeting",
		businessContext:
			"Mobile eco-friendly car valeting service using waterless cleaning products.",
		questionText:
			"Analyse two drawbacks for CleanWave Car Valeting of using waterless cleaning products.",
		totalMarks: 6,
		commandWord: "Analyse",
		templateKey: "aqa-6-mark-analyse",
		indicativeContent:
			"Strong answers develop two business-specific drawbacks with multi-step consequences — e.g. customer scepticism about cleaning effectiveness on muddy/heavily soiled cars → reduced demand vs traditional valeters; waterless products more expensive per unit, combined with mobile fuel costs → squeezed margins unless premium price absorbed by customers. Analyse — no evaluation required.",
		answers: [
			{
				id: "L1",
				text: "One drawback is that customers might not like the waterless product and think it doesn't clean well. This could be bad for the business. Another drawback is the products might cost more. This means CleanWave could spend more money. These things could be problems for the company.",
				expected: { level: 1, markMin: 1, markMax: 2, isTrap: false },
				whyNotes: [
					"Very basic statements",
					"No real chain of reasoning",
					"No specific AO2 (no mention of cars, dirt, premium pricing, etc.)",
					"Repetition ('this could be bad')",
				],
			},
			{
				id: "L2",
				text: "One drawback of using waterless cleaning products is that some customers might not trust them to clean dirt properly, especially on very muddy cars. This could make customers choose a different valeting company that uses normal water, meaning CleanWave loses some sales.\nA second drawback is that waterless products can be more expensive for the business to buy. If CleanWave uses a lot of these products each day, their costs will increase. Higher costs reduce profit unless they raise prices, which could annoy customers.\nThese drawbacks make using waterless products a bit risky.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: false },
				whyNotes: [
					"Correct AO1 + AO2",
					"Two points developed",
					"Consequences given, but shallow",
					"Still missing depth for Level 3",
				],
			},
			{
				id: "L3",
				text: "One drawback of using waterless cleaning products is that some customers may doubt the effectiveness of the service, particularly if their car is heavily soiled. Many drivers believe that proper cleaning requires water and shampoo. If customers feel the waterless method is less thorough, they may question whether the car's paintwork or wheels are being cleaned properly. This lack of trust could discourage potential customers from booking, reducing CleanWave's demand and limiting its ability to compete with traditional car valeting services.\nA second drawback is that waterless cleaning products are typically more expensive than bulk water and detergent. CleanWave would need to use a significant amount of product per car, especially on larger vehicles, increasing the overall cost per job. Since the business operates as a mobile service, travel costs such as fuel also add to operating expenses. Rising costs may reduce profit margins unless the business charges customers a higher price for the eco-friendly service. However, some customers may be unwilling to pay extra, which could reduce CleanWave's competitiveness.\nThese drawbacks are significant because they affect both customer perception and the business's cost structure.",
				expected: { level: 3, markMin: 5, markMax: 6, isTrap: false },
				whyNotes: [
					"Clear AO1",
					"Strong AO2 (paintwork, wheels, muddy cars, mobile fuel costs)",
					"Developed chains of reasoning",
					"Multiple consequences per point",
					"No evaluation (correct)",
					"Perfect realistic length",
				],
			},
			{
				id: "Fake-L3",
				text: "Using waterless cleaning products could be a drawback because some customers might not like the idea of it and think it doesn't clean well. This could make CleanWave lose customers if people prefer normal water cleaning.\nAnother drawback is that the waterless cleaning products might cost more for the business. This reduces profit and could mean CleanWave needs to put up prices, which some customers might not like either.\nOverall this shows that waterless cleaning can cause problems for the business.",
				expected: { level: 2, markMin: 3, markMax: 4, isTrap: true },
				whyNotes: [
					"AO2 very thin",
					"Oversimplified consequences",
					"'Customers might not like it' repeated",
					"Chains of reasoning underdeveloped",
					"No detail about cars, eco branding, or operating costs",
					"Final sentence is NOT an evaluation (and evaluation isn't required anyway)",
					"Too shallow → capped at L2",
				],
			},
		],
	},
]
