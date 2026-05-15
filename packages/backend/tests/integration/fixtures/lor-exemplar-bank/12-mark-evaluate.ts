import type { ExemplarQuestion } from "./types"

/**
 * 12-markers are qualitatively different from 9-markers.
 *
 * From the Exemplar Reference Bank (page 47): "DeepMark needs desperately to
 * see the difference between 9-markers (one-sided with evaluation) and
 * 12-markers (fully balanced 2-sided, heavier evaluation). If we don't train
 * it on these, it will under-mark strong students and over-mark weak ones."
 *
 * Structure: 4 levels (vs 3 for 9-markers) — L1 (AO1 only) / L2 (AO1+simple
 * AO2) / L3 (AO1+AO2+AO3 basic) / L4 (AO1+AO2+AO3 deep + multi-step + balanced
 * + sophisticated judgement). Top band 400+ words. The fake-L4 trap punishes
 * polished answers that lack genuine multi-step balance.
 */
export const TWELVE_MARK_EVALUATE_QUESTIONS: ExemplarQuestion[] = [
	{
		id: "autoselect-q1",
		businessName: "AutoSelect Used Cars",
		businessContext: "Used-car dealership.",
		questionText:
			"AutoSelect, a used-car dealership, is considering offering a 12-month warranty on all vehicles at no extra cost to the customer. Evaluate whether this is the best decision for the business.",
		totalMarks: 12,
		commandWord: "Evaluate",
		templateKey: "aqa-12-mark-evaluate",
		indicativeContent:
			"Strong answers weigh trust/sales uplift (uncertainty about reliability + hidden faults reduced; differentiation from competitors offering 3- or 6-month cover; positive review feedback loop) against material financial risk (parts + labour + diagnostics on first-year faults; overuse for minor issues if terms unclear; inspection process must be tightened — cost of additional staff/preparation). Stock profile is a dependency factor (newer/low-mileage stock = manageable; older/unreliable models = unsustainable claim volume). Conditional judgement on stock quality, inspection rigour and margin structure.",
		answers: [
			{
				id: "L1",
				text: "Offering a 12-month warranty could help AutoSelect because customers will think the cars are better quality. They may trust the business more and want to buy from them. But a warranty could also cost money if cars break and AutoSelect has to fix them. Some cars might have lots of faults and this would be expensive. It could be good or bad.",
				expected: { level: 1, markMin: 1, markMax: 4, isTrap: false },
				whyNotes: [
					"AO1 only",
					"No real AO2 (no reference to used cars, repairs, margins, etc.)",
					"No analysis",
					"No evaluation",
					"No judgement",
				],
			},
			{
				id: "L2",
				text: "A 12-month warranty could help AutoSelect because customers who buy used cars often worry about things going wrong. By offering a warranty, AutoSelect may attract more customers, and this could increase sales. Customers might feel safer buying from them instead of from a private seller.\nHowever, the warranty could be expensive if the cars develop faults. Used cars often need repairs, such as new brakes or engine parts. AutoSelect would have to pay for these, which reduces profit. If many cars need repairing, the business might lose money overall.\nOverall, the warranty could increase customer confidence but may cost the business money if faults are common.",
				expected: { level: 2, markMin: 5, markMax: 8, isTrap: false },
				whyNotes: [
					"AO1 present",
					"AO2 applied (brakes, used cars, customer fear)",
					"Limited analysis",
					"No balanced argument",
					"Judgement too simple",
				],
			},
			{
				id: "L3",
				text: "Offering a 12-month warranty could help AutoSelect because many customers worry about reliability when buying used cars. A warranty reduces this risk and may make AutoSelect seem more trustworthy. This could increase sales, especially for customers choosing between different dealerships. It also helps AutoSelect compete with larger national chains who already offer warranties as standard. If more customers choose AutoSelect, revenue could increase.\nHowever, offering a warranty increases costs. Used cars often need repairs within the first year, such as replacement tyres, battery issues or electrical faults. AutoSelect would need to pay for these repairs, which reduces profit. If the business sells older cars with higher mileage, it may face even more claims.\nThe decision also depends on how good AutoSelect's preparation process is. If the business checks cars carefully before selling them, the number of warranty claims may be low. But if its inspection process is weak, many customers will return with problems, increasing costs.\nOverall, offering a warranty could help AutoSelect attract more customers, but if repair costs are too high it may not be worth it.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: false },
				whyNotes: [
					"AO1 + AO2 good",
					"Some evaluation",
					"Not fully balanced",
					"No deep, multi-layered consequences",
					"Judgement lacks clear justification",
				],
			},
			{
				id: "L4",
				text: "Offering a 12-month warranty on all vehicles could significantly strengthen AutoSelect's competitive position. Customers purchasing used cars often face uncertainty around reliability, hidden faults and unexpected repair bills. A free 12-month warranty reduces this perceived risk and is likely to increase customer trust. This could raise sales volume, especially because many buyers compare dealerships online, and a longer warranty may help AutoSelect stand out from competitors offering only 3- or 6-month cover. Higher sales would also help AutoSelect spread fixed costs such as rent and advertising across more units, improving overall profitability. Additionally, if customers feel protected and looked after, they are more likely to leave positive reviews, which is essential in a market where online reputation strongly influences word-of-mouth.\nHowever, the warranty also creates significant financial risks. Used cars often require repairs during the first year, particularly if they have higher mileage or inconsistent service history. AutoSelect would pay for replacement parts, labour time and diagnostic checks. If the business sells lower-priced cars with thin profit margins, even a small number of warranty claims could wipe out profits. There is also a risk of customers overusing the warranty for minor issues if the terms are not clearly defined. Furthermore, AutoSelect would need to improve its inspection process before cars are sold. Technicians must identify potential faults early to avoid expensive repairs later. This may require hiring additional staff or extending preparation time, both of which increase costs.\nThe suitability of the warranty also depends on AutoSelect's stock profile. If the business focuses on newer vehicles with low mileage and full service history, repair costs may be manageable. But if the stock includes older cars or models known for reliability issues, warranty claims could become overwhelming.\nOverall, offering a 12-month warranty is beneficial if AutoSelect sells reliable cars, has strong inspection procedures and communicates clear warranty terms. If these conditions are not met, the financial burden may outweigh the benefits. Therefore, the decision depends on stock quality, technician capability and the business's profit margins.",
				expected: { level: 4, markMin: 11, markMax: 12, isTrap: false },
				whyNotes: [
					"Clear AO1",
					"Strong AO2 (service history, stock profile, margin structure)",
					"Deep multi-step AO3 (layers of consequences, dependency factors)",
					"Balanced argument",
					"Sophisticated conditional judgement",
					"Realistic length (400+ words)",
				],
			},
			{
				id: "Fake-L4",
				text: "A 12-month warranty would make AutoSelect look more trustworthy because customers feel safer buying a used car with protection. This could increase sales and improve customer satisfaction. It also helps them compete with other dealerships who offer warranties.\nHowever, the warranty could be expensive if cars break down. AutoSelect may need to pay for new parts like brakes, batteries or tyres. This reduces profit. Some customers might return too many times, which increases costs and takes time away from other work.\nOverall I think it is a good idea because customers like warranties and it helps AutoSelect stand out.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: true },
				whyNotes: [
					"AO2 basic",
					"Analysis shallow",
					"Little balance",
					"Judgement unjustified",
					"Not enough multi-step reasoning",
					"→ Capped at Level 3",
				],
			},
		],
	},
	{
		id: "glowcharge-q1",
		businessName: "GlowCharge Portable Power Banks",
		businessContext: "Portable power-bank rental kiosks in transport hubs.",
		questionText:
			"GlowCharge is considering switching from one-off rental fees to a monthly subscription model for unlimited power-bank usage. Evaluate whether this is the best decision for the business.",
		totalMarks: 12,
		commandWord: "Evaluate",
		templateKey: "aqa-12-mark-evaluate",
		indicativeContent:
			"Strong answers analyse predictable subscription revenue + loyalty + reduced churn vs unpredictable pay-per-use peaks, against operational risk (heavier usage → faster wear → more replacements + degraded batteries), pricing risk (subscription cannibalises occasional high-paying users), competitor inertia at pay-per-use, misuse risk (subscribers keeping units long-term unless tracking/penalties added), and digital infrastructure setup costs. Conditional on customer data, pricing strategy, hardware durability and logistics.",
		answers: [
			{
				id: "L1",
				text: "Having a monthly subscription might help GlowCharge because customers can use the chargers whenever they want. This could make more people choose them. But it might not be good because GlowCharge may not get enough money from each person. They might lose money if customers use the chargers a lot. It could be good or bad.",
				expected: { level: 1, markMin: 1, markMax: 4, isTrap: false },
				whyNotes: [
					"Basic AO1",
					"No AO2 (no mention of stations, battery cost, footfall)",
					"No analysis",
					"No evaluation",
					"No justification",
				],
			},
			{
				id: "L2",
				text: "Switching to a subscription model could help GlowCharge because customers who use power banks often may prefer paying one monthly fee instead of paying every time. This can make GlowCharge more convenient and increase customer loyalty. If people subscribe for several months, the business gets steady income.\nHowever, the subscription might reduce revenue from people who only used the power banks occasionally but paid a high one-off fee. GlowCharge would earn less from those customers. The business may also have to replace lost or damaged power banks more often if customers use them more frequently, which adds costs.\nOverall, a subscription could make GlowCharge more appealing but might reduce profit if the fee is too low.",
				expected: { level: 2, markMin: 5, markMax: 8, isTrap: false },
				whyNotes: [
					"AO2 applied (lost/damaged power banks, occasional users)",
					"Limited analysis",
					"Weak evaluation",
					"Judgement shallow",
				],
			},
			{
				id: "L3",
				text: "Subscription pricing could help GlowCharge create a more predictable income stream. At the moment the business relies on customers renting a power bank when their phone battery is low, which is unpredictable. A subscription means GlowCharge earns money each month even if the customer doesn't use the service. This could help GlowCharge plan spending on new units and charging stations. Subscriptions may also increase loyalty, reducing the chances of customers switching to competitors at train stations or shopping centres.\nHowever, the subscription model may not work well for GlowCharge unless it understands how often customers use the service. Many people only need a power bank occasionally, such as when travelling or at festivals. If the subscription price is low, these customers might not subscribe, so GlowCharge would not gain much. Heavy users, on the other hand, might subscribe and use the chargers more often, increasing wear and tear. GlowCharge may have to buy more replacement batteries or power banks, raising costs.\nOverall, the subscription model could improve GlowCharge's income reliability, but it depends on customer usage patterns and the subscription price.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: false },
				whyNotes: [
					"Decent AO1",
					"Good AO2 (footfall variation, hardware wear, customer patterns)",
					"Some analysis and evaluation",
					"Not fully balanced",
					"Judgement not deeply justified",
				],
			},
			{
				id: "L4",
				text: "Switching to a subscription model could significantly improve GlowCharge's financial stability. The current pay-per-use model relies on situational demand such as commuters forgetting their chargers, festival visitors running low on battery or shoppers staying out longer than planned. These spikes are unpredictable, which makes it difficult for GlowCharge to forecast revenue. A monthly subscription would provide a steady and reliable income stream, improving cash-flow management and helping the business invest in additional charging stations or higher-capacity power banks. Additionally, subscriptions encourage long-term loyalty. If customers subscribe, they are less likely to switch to competing power-bank rental kiosks in transport hubs. This reduces churn and strengthens GlowCharge's brand presence.\nHowever, this model creates several operational and financial risks. Subscriptions incentivise heavier usage; customers who previously rented only in emergencies may now use the service more often, increasing wear and tear. GlowCharge would need to maintain larger stocks of power banks and replace degraded batteries more frequently, raising costs. Moreover, a subscription model may appeal primarily to frequent travellers, leaving occasional users behind. If the subscription fee is priced too low, GlowCharge may lose revenue from people who once paid high one-off fees. Another challenge is misuse: subscribers may forget to return power banks for long periods, which increases losses unless GlowCharge introduces penalties or tracking.\nGlowCharge must also consider competitor behaviour. If rival companies continue using pay-per-use pricing, GlowCharge may shift its model too early, particularly if customer demand for subscriptions is low. The business may also need to invest in a new digital system to manage recurring payments, account management and usage tracking, adding setup and maintenance costs.\nOverall, the subscription model is beneficial if GlowCharge has strong customer data showing a large base of regular users, and if it can manage the increased operational pressure caused by heavier usage. If the business misprices the subscription or lacks the capacity to replace damaged units quickly, the financial risk could outweigh the stable income. The decision ultimately depends on pricing strategy, hardware durability and the reliability of GlowCharge's logistics.",
				expected: { level: 4, markMin: 11, markMax: 12, isTrap: false },
				whyNotes: [
					"Deep AO1",
					"Rich AO2 (wear, footfall, misuse, competitor models, logistics)",
					"Multi-step analysis",
					"Balanced evaluation",
					"Fully justified judgement",
					"Strong conditional reasoning",
					"Proper length (400–450 words)",
				],
			},
			{
				id: "Fake-L4",
				text: "A subscription model might help GlowCharge by making income more predictable. Customers may like paying monthly instead of paying each time they need a charger. This can also help GlowCharge keep customers for longer.\nBut there are problems. GlowCharge would have to replace more power banks because customers may use them more often. The company might also lose money from people who used to pay high one-off fees. If customers do not use the service enough, they may cancel the subscription.\nOverall, I think it is a good idea because many people prefer subscriptions and it gives regular income.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: true },
				whyNotes: [
					"AO2 vague",
					"No multi-step evaluation",
					"Large missing consequences",
					"Judgement unjustified",
					"Not balanced enough",
					"→ Capped at Level 3",
				],
			},
		],
	},
	{
		id: "skyview-q1",
		businessName: "SkyView Drone Photography",
		businessContext:
			"Aerial drone photography service for weddings, estate agents and marketing.",
		questionText:
			"SkyView Drone Photography is considering offering a premium 'same-day editing and delivery' service for an additional fee. Evaluate whether this is the best decision for the business.",
		totalMarks: 12,
		commandWord: "Evaluate",
		templateKey: "aqa-12-mark-evaluate",
		indicativeContent:
			"Strong answers analyse competitive positioning vs urgent-deadline clients (weddings, estate-agent marketing) + revenue uplift via premium fee, against operational pressure (compressed turnaround on already-tight flying/editing day; labour cost of dedicated editors or extended hours; capital expenditure on editing hardware; quality risk if rushed; weather-dependent flying time). Conditional on staffing, hardware, pricing strategy and demand for the premium tier.",
		answers: [
			{
				id: "L1",
				text: "Offering same-day editing could help SkyView because customers will get their photos quicker. This might make more people want to use them. But it could also be bad because it will take more time and effort. The business might need more workers and this will cost money. It could be good or bad.",
				expected: { level: 1, markMin: 1, markMax: 4, isTrap: false },
				whyNotes: [
					"AO1 only",
					"No AO2 (no drones, editing software, wedding events, weather issues, etc.)",
					"No analysis",
					"No evaluation",
					"No real judgement",
				],
			},
			{
				id: "L2",
				text: "Same-day editing and delivery could attract more customers because people often want photos or videos quickly after an event. For example, wedding couples or estate agents might want results on the same day. This could make SkyView seem more professional and allow them to charge extra for the service.\nHowever, editing photos and videos quickly takes time. SkyView may need more staff or longer working hours to meet the deadline. The business may also need better editing software or faster computers, which cost money. If there are a lot of bookings in one day, SkyView might struggle to finish everything on time, leading to complaints.\nOverall, offering same-day editing could increase revenue but may also increase costs and pressure.",
				expected: { level: 2, markMin: 5, markMax: 8, isTrap: false },
				whyNotes: [
					"AO1 and AO2 present",
					"Limited depth",
					"Basic evaluation only",
					"Judgement not justified",
				],
			},
			{
				id: "L3",
				text: "Offering a premium same-day editing service could help SkyView attract high-value customers who need quick turnaround. Estate agents, wedding clients and marketing teams often want content uploaded immediately for advertising, and being able to deliver on the same day gives SkyView a competitive advantage. This could allow the business to charge a higher price, increasing revenue per job. Fast delivery may also improve the business's reputation, leading to positive reviews.\nHowever, same-day editing places pressure on staff. Drone photography requires both flying and editing skills, and offering same-day delivery means editors must be available immediately after shoots. This may cause scheduling problems, especially if SkyView has multiple bookings in a day. There is also a risk that staff may rush editing to meet deadlines, leading to lower quality and disappointed customers. SkyView may need better computers, memory cards and backup drives to handle high-volume editing, adding costs.\nOverall, same-day editing could give SkyView a competitive advantage but increases pressure and costs.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: false },
				whyNotes: [
					"AO1 and AO2 strong",
					"Some AO3, but not fully balanced",
					"Judgement simplistic",
					"Missing deeper operational, regulatory, and workflow analysis",
				],
			},
			{
				id: "L4",
				text: "Introducing a premium same-day editing and delivery service could significantly strengthen SkyView's competitive positioning. In industries such as wedding videography, estate-agent marketing and social-media advertising, clients increasingly prioritise speed. If SkyView can deliver edited aerial footage within hours, it may appeal to customers with urgent deadlines. This service allows the business to charge a higher fee, increasing revenue per booking. Because drone jobs often involve travel time and short filming sessions, the added income from same-day editing could improve overall profitability without requiring additional flights. Fast delivery could also enhance SkyView's online reputation, as clients may leave positive reviews, which is crucial in a competitive creative industry.\nHowever, there are substantial operational challenges. Drone shoots already require precise planning, travel, battery management and compliance with safety regulations. Adding same-day editing means staff must immediately edit footage after the job, which may extend working hours and increase fatigue. If the business has multiple bookings in one day, it may be impossible to deliver same-day edits without hiring dedicated editors. This significantly raises labour costs. Additionally, high-quality editing requires powerful computers; upgrading hardware and software increases capital expenditure. There is also a risk that rushing edits reduces quality, weakening SkyView's brand image and causing refunds or poor reviews.\nAnother consideration is demand uncertainty. Not all clients will want or need same-day delivery. If SkyView invests heavily in faster computers or additional editors but few customers choose the premium service, the costs may not be recovered. Furthermore, poor weather conditions may delay filming, leaving less time for editing and increasing the chance of missed deadlines.\nOverall, same-day editing is a strong opportunity if SkyView has enough staff, appropriate editing hardware and a clear pricing strategy that covers additional labour and equipment costs. The service is most effective for high-value clients with urgent deadlines. If SkyView cannot guarantee consistent quality or has limited editing capacity, the pressure and financial investment may outweigh the benefits. The decision depends on scheduling, staffing, hardware capability and customer demand.",
				expected: { level: 4, markMin: 11, markMax: 12, isTrap: false },
				whyNotes: [
					"Deep AO1 (workflow, regulations, hardware, labour)",
					"Rich AO2 (weddings, estate agents, battery management)",
					"Multi-step analysis",
					"Balanced evaluation",
					"Conditional judgement",
					"Realistic examiner length (400+ words)",
				],
			},
			{
				id: "Fake-L4",
				text: "A premium same-day editing service could help SkyView attract customers who need quick results. It makes the business stand out and allows them to charge more money. This could increase revenue and help them grow.\nHowever, editing takes time and SkyView might not be able to do it quickly if they have lots of jobs. They may need better computers or more staff, which costs money. If they rush the job, the quality might not be good.\nOverall I think it is a good idea because customers always want fast results and it makes SkyView more competitive.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: true },
				whyNotes: [
					"AO2 shallow",
					"Missing complex reasoning",
					"Evaluation superficial",
					"No balanced argument",
					"Judgement unjustified",
					"→ Capped at L3",
				],
			},
		],
	},
	{
		id: "aquapure-q1",
		businessName: "AquaPure Home Water Systems",
		businessContext: "Home water-filtration system manufacturer and installer.",
		questionText:
			"AquaPure is considering offering interest-free payment plans to customers who purchase its home water-filtration systems. Evaluate whether this is the best decision for the business.",
		totalMarks: 12,
		commandWord: "Evaluate",
		templateKey: "aqa-12-mark-evaluate",
		indicativeContent:
			"Strong answers analyse access expansion to middle-income households (£500–£1,200 upfront cost barrier) + sales-volume uplift → bulk-order economies + competitive differentiation vs upfront-only rivals, against financial strain (must pay installers/parts/travel before customer payment received → cash-flow risk + default risk), installation scheduling pressure under demand surges, and customer-mix risk (low-monthly-payment buyers may not afford future filter replacements → lower repeat revenue). Conditional on cash reserves, payment-processing infrastructure and installation scalability.",
		answers: [
			{
				id: "L1",
				text: "Offering interest-free payments could help AquaPure because customers might like paying in smaller amounts instead of all at once. This could make more people buy the system. But it might also be bad because AquaPure gets the money slowly and customers might stop paying. Then the business loses money. It could be good or bad.",
				expected: { level: 1, markMin: 1, markMax: 4, isTrap: false },
				whyNotes: [
					"Pure AO1",
					"No AO2 (installation, maintenance, reliability, competition)",
					"No analysis",
					"No evaluation",
					"No judgement",
				],
			},
			{
				id: "L2",
				text: "Offering interest-free payments may attract more customers because the filtration systems are expensive. Some families cannot afford the full cost at once, so paying monthly could encourage more people to buy one. This would increase sales for AquaPure.\nHowever, AquaPure would not receive the money straight away. If customers take 12–24 months to pay, the business may run into cash-flow issues, especially when buying equipment or paying staff to install the units. There is also a risk that some customers might miss payments, which could lead to financial loss.\nOverall, interest-free plans could increase sales but may cause cash-flow problems.",
				expected: { level: 2, markMin: 5, markMax: 8, isTrap: false },
				whyNotes: [
					"AO2 applied (installers, affordability)",
					"Limited detail",
					"Basic evaluation",
					"Judgement simple",
				],
			},
			{
				id: "L3",
				text: "Interest-free payment plans could increase AquaPure's customer base because water-filtration systems can be expensive and many households prefer paying in smaller monthly amounts. This could help AquaPure reach customers who would normally choose cheaper options such as supermarket filters. If AquaPure attracts more customers, the business can spread fixed costs like warehouse rent and installation tools over more units, improving profitability.\nHowever, the business must manage the financial risk of delayed payments. AquaPure must pay installers, buy filtration units and maintain vans before receiving the customer's full payment. If many customers choose interest-free plans, cash-flow pressure may increase. There is also a risk of missed payments if customers cancel or change bank details. AquaPure may need to introduce payment-tracking systems or spend time chasing overdue payments.\nOverall, interest-free payments could expand AquaPure's market but may create financial risks.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: false },
				whyNotes: [
					"Clear AO1",
					"Good AO2 (warehouse, installation vans, cheap alternatives)",
					"Some analysis and evaluation",
					"Judgement shallow",
					"Not enough multi-step argument for L4",
				],
			},
			{
				id: "L4",
				text: "Offering interest-free payment plans could significantly increase AquaPure's ability to reach middle-income households who cannot afford the upfront cost of a full water-filtration system. These systems are often priced between £500–£1,200, which is a barrier for many customers. By allowing interest-free monthly payments, AquaPure makes the product more accessible and may dramatically increase sales volume. Higher sales would allow the business to order filtration units in bulk, reducing average cost per unit and improving profit margins. Additionally, interest-free plans may help AquaPure stand out from competitors who require payment upfront, giving the business a clear marketing advantage.\nHowever, offering payment plans creates major financial challenges. AquaPure must pay installers, purchase units and cover travel costs before receiving payment from the customer. This means the business takes on cash-flow risk, particularly if many customers choose long-term payment options. AquaPure may need a strong cash reserve or external financing to maintain operations. There is also default risk; if customers miss payments or cancel direct debits, AquaPure may struggle to recover the outstanding balance. This is more likely in households with unstable income. The business may need administrative staff or software systems to monitor payments, adding to overhead costs.\nAnother concern is the impact on installation scheduling. If demand rises sharply due to the attractive payment plans, AquaPure may struggle to complete installations quickly. This could lead to delays, negative reviews and pressure on installation teams. Furthermore, offering interest-free plans may attract price-sensitive customers who prioritise low monthly payments over long-term maintenance. If customers cannot afford replacement filters later, AquaPure may earn less repeat revenue.\nOverall, interest-free payment plans are beneficial if AquaPure has strong cash reserves, reliable payment-processing systems and enough installation capacity to handle increased demand. If these conditions are not met, the financial and operational risks may outweigh the benefits. The decision depends on cash-flow stability, customer reliability and the business's ability to scale.",
				expected: { level: 4, markMin: 11, markMax: 12, isTrap: false },
				whyNotes: [
					"AO1 accurate",
					"AO2 rich (pricing, vans, equipment, filter replacements)",
					"Deep AO3 (cash-flow, demand shock, administrative load)",
					"Fully balanced",
					"Conditional judgement",
					"Multi-layer consequences",
					"Authentic 400+ word length",
				],
			},
			{
				id: "Fake-L4",
				text: "Offering interest-free payments could help AquaPure gain more customers because it makes the filtration system easier to afford. Customers may prefer spreading the cost, and the business could increase sales. It also helps AquaPure compete with other companies.\nHowever, this can also cause problems. AquaPure may not get the money straight away and could have cash-flow issues. Customers might also miss payments, which reduces the business's profit. AquaPure might need to spend money on software or staff to manage payments.\nOverall, I think it is a good idea because it increases sales and makes the business more competitive.",
				expected: { level: 3, markMin: 9, markMax: 10, isTrap: true },
				whyNotes: [
					"AO2 shallow",
					"No multi-step reasoning",
					"Weak evaluation",
					"Judgement unbalanced",
					"Missing dependency factors",
					"→ Capped at Level 3",
				],
			},
		],
	},
]
