import type { ExemplarQuestion } from "./types"

export const NINE_MARK_EVALUATE_QUESTIONS: ExemplarQuestion[] = [
	// ── BrightBean Coffee Roasters ───────────────────────────────────────────
	{
		id: "brightbean-q1",
		businessName: "BrightBean Coffee Roasters",
		businessContext: "Local coffee roasting company planning expansion.",
		questionText:
			"BrightBean Coffee Roasters is considering opening a second shop in a nearby town. Evaluate whether this is the best decision for the business.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers analyse growth/expansion upside (wider regional presence, brand awareness, larger batch roasting → economies of scale, risk-spread across two locations) against significant downside (rent + wages + utilities + renovation fixed costs, demand uncertainty, operational complexity of managing two sites — supervision, supply logistics, consistent quality). Conditional judgement: good decision if strong local demand and competition manageable; if uncertain or saturated, risks dominate.",
		answers: [
			{
				id: "L1",
				text: "Opening a second shop could help BrightBean get more customers because it is in another town. This means they might make more money. But it could be bad if the shop doesn't get many customers and they lose money. It also costs a lot to open a new place. I think they should be careful. It might work or might not.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Basic AO1",
					"Minimal AO2",
					"No chains of reasoning",
					"No proper evaluation",
					"'might work' = meaningless conclusion",
				],
			},
			{
				id: "L2",
				text: "Opening a second shop could help BrightBean reach more customers, especially if the nearby town has a busy high street. This means the business could increase sales and brand awareness because more people see their products. It also spreads risk because the business is not relying on just one shop.\nHowever, opening a new shop is expensive. BrightBean will need to pay rent, hire staff and buy equipment. If the new location is not as popular, the business might not make enough sales to cover these costs. This would reduce BrightBean's profit and could even lead to financial problems.\nOverall, opening a second shop could work well if the new area has lots of customers, but if demand is low it could be risky.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 correct",
					"AO2 basic but present (busy high street, rent, equipment)",
					"Evaluation shallow ('could be risky')",
					"Judgement very limited",
					"Insufficient depth for Level 3",
				],
			},
			{
				id: "L3",
				text: "Opening a second shop could help BrightBean Coffee Roasters expand its customer base and increase overall revenue. If the nearby town has a strong café culture and high footfall, BrightBean could attract customers who value freshly roasted coffee, helping the brand build a wider regional presence. A second shop also supports economies of scale, as the business can roast larger batches of beans at once, reducing average costs. This could improve profit margins across both shops. In addition, spreading operations across two locations reduces reliance on the original site, which makes the business more resilient if demand in one area temporarily falls.\nHowever, opening a second shop involves significant financial risk. BrightBean will need to cover rent, staff wages, utilities and renovation costs before the shop begins generating income. If customer demand in the new town is lower than expected, the business may struggle to cover these fixed costs, reducing its profitability. Managing two locations also increases operational complexity; BrightBean will need reliable supervisors, consistent quality control and efficient supply logistics. A shortage of experienced staff could damage customer service standards and weaken the brand's reputation.\nOverall, opening a second shop is a good decision if BrightBean has conducted strong market research showing high local demand and limited competition. If the new town already has several established coffee shops or if demand is uncertain, the risks may outweigh the benefits. Therefore, the best decision depends on the strength of customer demand and BrightBean's ability to manage two sites effectively.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"Strong AO1 (costs, logistics, economies of scale)",
					"Strong AO2 (customer footfall, roasting capacity, staff supervision)",
					"Full AO3 analysis on both sides",
					"High-quality conditional evaluation",
					"Proper 'It depends'",
					"Correct realistic length for 9/9",
				],
			},
			{
				id: "Fake-L3",
				text: "Opening a second shop could help BrightBean reach new customers and become more popular in the area. This means higher sales and the chance to grow the brand. It also gives BrightBean more opportunities to sell their fresh roasted coffee, which customers enjoy.\nHowever, a second shop is expensive to run and could take a long time to become profitable. BrightBean would have to pay rent, staff and other bills. If not enough people visit, they might lose money.\nOverall I think opening a second shop is a good idea because it helps the business grow and more people will know about them.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 vague",
					"Analysis shallow",
					"No chains of reasoning",
					"No real evaluation",
					"Judgement unsubstantiated",
					"→ Capped at L2",
				],
			},
		],
	},
	{
		id: "brightbean-q2",
		businessName: "BrightBean Coffee Roasters",
		businessContext: "Local coffee roasting company planning expansion.",
		questionText:
			"BrightBean Coffee Roasters is considering starting a subscription service where customers receive a bag of freshly roasted coffee each month. Evaluate whether this is the best decision for the business.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers weigh predictable subscription revenue (planning, larger batch roasting, customer loyalty) against operational/financial risk (packaging+delivery+website investment, customer churn if quality drops, large competitors dominating subscription market). Conditional 'it depends' on market research + operational capacity to fulfil consistently.",
		answers: [
			{
				id: "L1",
				text: "A subscription could help BrightBean because customers get coffee every month and this makes more money. It is also good because people might keep the subscription for a long time. But it could be bad if people don't want to sign up or if they cancel quickly. It might take a lot of time to organise everything. I think it could be good but also risky.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Basic AO1 only",
					"Minimal AO2 (no mention of roasting, delivery, packaging, etc.)",
					"No chains of reasoning",
					"No proper evaluation",
					"Judgement is meaningless",
				],
			},
			{
				id: "L2",
				text: "Starting a subscription service could help BrightBean because it gives the business regular income each month. This is useful because it makes it easier to predict sales. Customers who enjoy BrightBean's coffee may find it convenient to get it delivered automatically, which means the business could increase customer loyalty and sell more coffee overall.\nHowever, a subscription service involves extra work. BrightBean will need to manage packaging, delivery and customer records. If there are problems with deliveries or delays, customers might cancel, which reduces the benefit. There is also a risk that BrightBean buys too many beans and can't sell them if subscriptions don't grow as expected.\nOverall, a subscription could help BrightBean grow, but it depends on whether enough people sign up.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 sound",
					"AO2 partially applied",
					"Evaluation present but weak",
					"Judgement superficial",
					"Missing multi-step reasoning",
					"Lacks depth for Level 3",
				],
			},
			{
				id: "L3",
				text: "Introducing a subscription service could provide BrightBean Coffee Roasters with a stable and predictable revenue stream. Unlike café sales, which fluctuate depending on footfall and weather, subscription payments are regular and allow the business to plan production more efficiently. This is particularly valuable for BrightBean because roasting coffee in larger batches reduces average costs, helping the business benefit from economies of scale. A subscription model also increases customer loyalty; once customers sign up, they are less likely to purchase coffee from competitors, which strengthens BrightBean's brand and long-term customer base.\nHowever, developing a subscription service also carries risks. BrightBean would need to invest in packaging equipment, delivery partnerships and website integration to manage recurring payments. These are significant upfront costs. If the business does not attract enough subscribers, it may struggle to cover these expenses. There is also the risk of customer churn; if the coffee quality is inconsistent or if deliveries are delayed, customers may cancel quickly. Managing customer expectations and ensuring reliable stock levels becomes more complex when fulfilling regular orders. Additionally, larger competitors such as supermarket coffee brands or national subscription services may already dominate the market, making it harder for BrightBean to stand out.\nOverall, the subscription service is a good decision if BrightBean conducts strong market research and ensures it has the operational capacity to fulfil orders consistently. If the local customer base is enthusiastic about artisan coffee and willing to subscribe, the model could significantly improve revenue stability. However, if demand is uncertain or if BrightBean cannot manage logistics effectively, the risks may outweigh the benefits. The final decision depends on customer demand, delivery reliability and BrightBean's ability to scale its roasting operation.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"Strong AO1 (batch roasting, churn, costs, logistics)",
					"Strong AO2 (BrightBean-specific production, weather footfall, artisan demand)",
					"Fully balanced",
					"Multi-step chains of reasoning",
					"Conditional evaluation clearly justified",
					"True high-band length (near 300 words)",
				],
			},
			{
				id: "Fake-L3",
				text: "A subscription service could be good for BrightBean because it gives them regular money each month and helps them build a stronger relationship with customers. People who like BrightBean's coffee will enjoy getting it delivered to their home. This means the business could grow and become better known.\nBut subscriptions also have risks. BrightBean might not get enough customers signing up, and if deliveries are slow customers could get annoyed and cancel. It also costs money to set everything up. If the business doesn't make enough profit from the subscriptions, it might not be worth doing.\nOverall I think it is a good idea because it helps the business get more customers and steady income.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 shallow",
					"Analysis generic",
					"Evaluation superficial",
					"Missing depth, specifics, and realistic consequences",
					"Final judgement not justified",
					"→ Capped at L2",
				],
			},
		],
	},

	// ── EcoRide E-Bikes ──────────────────────────────────────────────────────
	{
		id: "ecoride-q1",
		businessName: "EcoRide E-Bikes",
		businessContext: "Electric bike manufacturer.",
		questionText:
			"EcoRide E-Bikes is considering offering a two-year free servicing package with every new bike purchase. Evaluate whether this is the best decision for the business.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers weigh customer reassurance (battery/brake/motor concerns) and resulting demand uplift + economies of scale on components, against servicing cost (trained technicians, parts inventory, workshop capacity), risk of underestimating maintenance expense and damage to satisfaction if demand exceeds capacity. Conditional on reliability data + staffing.",
		answers: [
			{
				id: "L1",
				text: "Giving free servicing might help EcoRide because customers will think it is a good deal. This could make more people buy the bikes. But it might also cost them money if they have to fix lots of bikes for free. If the bikes break a lot then it will be expensive. They might also get busy and not be able to do all the servicing. I think it could be good or bad depending on the situation.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Basic AO1",
					"No developed analysis",
					"Little or no AO2",
					"Generic, repetitive",
					"Weak judgement",
				],
			},
			{
				id: "L2",
				text: "Offering a two-year free servicing package could help EcoRide attract more customers, especially people who are worried about maintenance costs. Buying an electric bike is a big investment, so knowing that the servicing is free may make customers feel safer about spending the money. This means EcoRide might increase sales and build trust with customers.\nHowever, free servicing is expensive for the business. EcoRide will need trained staff and spare parts to do the repairs, and these cost money. If many customers bring their bikes for servicing, EcoRide could struggle to keep up with demand and this might lead to long waiting times or complaints. If too many resources are used on free servicing, the business might make less profit from selling the bikes.\nOverall, this idea could help increase sales, but it may also be costly if EcoRide has too many servicing requests.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 correct",
					"AO2 partially applied (big investment, maintenance concerns)",
					"Evaluation is simple",
					"Judgement weak",
					"Missing deep multi-step reasoning",
				],
			},
			{
				id: "L3",
				text: "Offering a two-year free servicing package could make EcoRide E-Bikes a more attractive option for customers, especially because electric bikes often require specialised maintenance. Many potential buyers worry about battery health, brake wear and motor reliability over time. By including free servicing, EcoRide reduces this uncertainty and makes the purchase feel safer. This could increase demand, particularly among first-time e-bike users who are unsure about long-term running costs. If EcoRide sells more bikes, it can benefit from economies of scale when ordering components such as batteries or hydraulic brakes, which may reduce average costs across the business.\nHowever, servicing electric bikes can be expensive and time-consuming. EcoRide would need to invest in trained technicians, stock spare parts and potentially expand workshop space to handle the extra workload. If many customers request free servicing within the same period, there may be long waiting times, which could damage customer satisfaction instead of improving it. The business also risks underestimating the cost of providing free servicing; maintenance issues like battery degradation or electrical faults are unpredictable and expensive to fix. If EcoRide ends up spending more on servicing than it gains through additional sales, profit margins could fall significantly.\nOverall, a two-year free servicing package is a good decision if EcoRide has accurate data on the typical cost and frequency of repairs, and if its staffing capacity is high enough to manage demand. If the business can deliver servicing efficiently without excessive costs, the offer could strengthen customer loyalty and increase sales. However, if servicing demand is high or unpredictable, the financial risk may outweigh the benefits. Therefore, the decision depends on EcoRide's operational capacity and the reliability of its e-bike models.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"Strong AO1 (battery degradation, technician training, workshop capacity)",
					"Strong AO2 (EcoRide-specific risks and customer motivations)",
					"Developed analysis",
					"Proper, contextual evaluation",
					"Clear conditional judgement",
					"Realistic 9-mark length",
				],
			},
			{
				id: "Fake-L3",
				text: "Offering two years of free servicing could help EcoRide because customers will think the bikes are better value. This can increase sales and make customers trust the brand more. It also means EcoRide looks more professional and competitive compared to other e-bike businesses.\nHowever, servicing the bikes for free costs money and takes time. EcoRide might have to pay for parts and hire more workers to do the servicing. If lots of customers come back with problems, the business could become very busy and customers might have to wait a long time. This could annoy them and affect EcoRide's reputation.\nOverall I think it is a good idea because customers like deals and it helps EcoRide stand out.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 shallow",
					"'Looks professional' = weak reasoning",
					"No real consequences",
					"No detailed analysis",
					"Weak evaluation",
					"Judgement unjustified",
					"→ Capped at L2",
				],
			},
		],
	},
	{
		id: "ecoride-q2",
		businessName: "EcoRide E-Bikes",
		businessContext: "Electric bike manufacturer.",
		questionText:
			"EcoRide E-Bikes is considering selling its bikes through large national retailers instead of only through its own shop and website. Evaluate whether this is the best decision for EcoRide.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers weigh expanded reach (Halfords/Evans Cycles footfall + finance/store credit) and brand exposure against retailer margins (20–40% of sale price → reduced profit per unit), loss of customer-experience control (non-specialist staff misexplaining motors/batteries/warranties), and inventory pressure from larger production runs. Conditional on EcoRide's growth strategy and the retailer's product expertise.",
		answers: [
			{
				id: "L1",
				text: "Selling through big retailers could help EcoRide because more people might see the bikes. This can make them sell more. But the retailers might take a big percentage of the money which means EcoRide earns less. EcoRide also might not control how the bikes are sold. The shops might not explain things properly. I think it could be good but also bad.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Simple AO1",
					"Almost no AO2",
					"No chain of reasoning",
					"No proper evaluation",
					"Very surface-level",
				],
			},
			{
				id: "L2",
				text: "Selling through national retailers could help EcoRide because their bikes would be seen by thousands of customers across the country. This could increase sales and help more people recognise the EcoRide brand. Retailers also have trained sales staff who can explain features, which might help customers feel confident about buying an e-bike.\nHowever, retailers usually take a high commission on each sale. This means EcoRide would make less profit per bike than when selling through its own website. EcoRide would also lose some control over how the bikes are presented. If staff in the retailer do not understand the product properly, customers might get the wrong information or not get the support they need.\nOverall, selling through retailers could increase brand awareness but may reduce profit margins.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"Solid AO1",
					"AO2 moderately applied",
					"Simple evaluation",
					"Judgement limited and not fully justified",
					"Not enough depth, detail, or 'depends on' for Level 3",
				],
			},
			{
				id: "L3",
				text: "Selling through national retailers could significantly expand EcoRide's reach. At the moment, customers who do not live near EcoRide's shop or who do not search online for specialist e-bikes may never hear of the brand. Retailers such as Halfords or Evans Cycles attract high footfall and already have loyal customers. By placing EcoRide's bikes in these stores, the business could dramatically increase visibility, which may lead to higher sales and faster brand growth. Retailers also offer finance options and store credit, making expensive products more accessible. This could help EcoRide reach customers who might not otherwise afford an e-bike upfront.\nHowever, selling through retailers also creates significant drawbacks. Retailers typically demand large margins, sometimes taking 20–40% of the sale price. This would sharply reduce EcoRide's profit per unit. The business would also lose control over the customer experience; staff at national retailers may not have specialist knowledge about e-bike motors, batteries or warranties. A poor explanation could lead to unrealistic customer expectations and more returns. Additionally, EcoRide would need to keep retailers stocked, meaning larger production runs and higher inventory costs. If demand at retailers is unpredictable, EcoRide risks overproduction or stock sitting unsold for months.\nOverall, selling through national retailers is a good decision if EcoRide prioritises rapid growth and can accept lower margins in exchange for exposure. It is most effective if the retailers have knowledgeable staff and the brand can maintain consistent supply. However, if EcoRide's business model depends on high margins and close customer service, the risks of losing control may outweigh the benefits. The decision ultimately depends on whether EcoRide values reach or profitability more.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"Clear AO1",
					"Strong, specific AO2 (retailer margins, store credit, supply chain implications)",
					"Full chains of reasoning",
					"Balanced evaluation",
					"Conditional judgement",
					"Realistic top-band length",
				],
			},
			{
				id: "Fake-L3",
				text: "Selling through national retailers could help EcoRide because lots of customers visit those shops. This means the business can reach more people and increase sales. Retailers also make the bikes more accessible and help customers learn about the features.\nHowever, retailers will take a percentage of each sale which reduces profit. EcoRide might earn less money than selling on its own website. There is also a risk that staff at the retailer don't explain the bike properly, which could cause confusion or complaints from customers.\nOverall I think selling through retailers is a good idea because it helps EcoRide grow and become more widely known.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 shallow (no concrete details)",
					"Only one consequence per point",
					"Weak evaluation ('good idea because helps them grow')",
					"No 'it depends'",
					"Missing deeper financial + operational reasoning",
					"Too short in structure to be Level 3",
					"→ Capped at L2",
				],
			},
		],
	},

	// ── UrbanGlide Scooters ──────────────────────────────────────────────────
	{
		id: "urbanglide-q1",
		businessName: "UrbanGlide Scooters",
		businessContext: "Urban commuter-focused electric scooter manufacturer.",
		questionText:
			"UrbanGlide Scooters is considering reducing the price of its commuter e-scooter by £150. Evaluate whether this is the best decision for the business.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers analyse demand uplift in a price-sensitive commuter market and economies of scale on batteries/motors/frames, against thin margins on regulated lithium-ion hardware, brand-repositioning risk (mid-range → budget) and customer expectation of future discounts. Conditional on cost structure and competitor positioning.",
		answers: [
			{
				id: "L1",
				text: "Reducing the price could help UrbanGlide because more people might buy the scooter if it's cheaper. This means they get more customers. But it might also be bad because they will get less money per scooter. They also might not make enough profit. If the scooters cost a lot to make then lowering the price could be a problem. I think it might be good if people really want scooters.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Very basic AO1",
					"No multi-step reasoning",
					"AO2 extremely thin",
					"No real evaluation",
					"Generic, repetitive",
				],
			},
			{
				id: "L2",
				text: "Reducing the price by £150 could increase UrbanGlide's sales because customers may think the scooter is better value. Many commuters want cheaper ways to travel and a lower price could attract people who were unsure before. This would increase revenue if enough new customers buy the scooter.\nHowever, electric scooters have expensive components like batteries and motors. If UrbanGlide already has low profit margins, cutting the price may mean they get very little profit per scooter. If sales do not increase enough, the business could lose money overall. A lower price may also make the scooter seem lower quality than competitors.\nOverall, reducing the price could increase demand, but it could also lower profit margins if the rise in sales is not large enough.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 correct and relevant",
					"AO2 partially developed (batteries, motors, commuters)",
					"Evaluation is simple",
					"Judgement not fully justified",
					"Consequences shallow",
				],
			},
			{
				id: "L3",
				text: "Reducing the price of UrbanGlide's commuter e-scooter by £150 could significantly increase demand. Many commuters are price-sensitive, especially in urban areas where they compare scooters with public transport costs. A lower price may make the scooter competitive against rival brands or cheaper models on online marketplaces. By attracting more cost-conscious buyers, UrbanGlide could increase unit sales, which might allow it to purchase batteries, motors and frames in larger quantities. This could create economies of scale, lowering the average cost per scooter and helping UrbanGlide remain competitive in a growing market.\nHowever, price cuts also involve risks. Electric scooters often have tight profit margins due to expensive lithium-ion batteries and regulatory safety components. Reducing the selling price by £150 could significantly reduce UrbanGlide's profit per unit, particularly if production costs have recently risen. If sales do not increase enough to compensate, total profits may fall. A sustained lower price could also reposition the brand as a budget option rather than a mid-range, reliable commuter scooter. This may damage UrbanGlide's reputation, especially if competitors maintain higher prices and present themselves as premium alternatives. Additionally, a lower price could encourage customers to delay purchases in the future, expecting new discounts.\nOverall, reducing the price is a good decision if UrbanGlide operates in a highly competitive market where customers are currently choosing cheaper alternatives, and if production costs can be lowered through economies of scale. If UrbanGlide's costs remain high or if the brand relies on a premium reputation, the price cut may reduce profitability and weaken the brand. Therefore, the decision depends on cost structure, market competition and the business's positioning strategy.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"AO1 accurate (components, cost structure, competition)",
					"AO2 highly applied (commuters, urban price sensitivity, brand perception)",
					"Rich multi-step reasoning",
					"Fully balanced evaluation",
					"Strong conditional judgement",
					"Right length for a true 9-mark script",
				],
			},
			{
				id: "Fake-L3",
				text: "Reducing the price of the scooter could help UrbanGlide because customers will think it is a better deal. This means more people might buy it and the business could make more sales. It also helps the business stay competitive with other scooter brands.\nThe problem is that lowering the price might mean UrbanGlide makes less profit on each scooter. If components are expensive, then they will get less money for every sale. It also means customers might expect discounts again in the future.\nOverall I think it is a good idea because it helps increase sales and brings in more customers.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 superficial",
					"No deep financial analysis",
					"No multi-step chains",
					"No real evaluation",
					"Judgement weak and unjustified",
					"→ Capped at L2",
				],
			},
		],
	},
	{
		id: "urbanglide-q2",
		businessName: "UrbanGlide Scooters",
		businessContext: "Urban commuter-focused electric scooter manufacturer.",
		questionText:
			"UrbanGlide Scooters is considering launching a subscription plan where customers pay a monthly fee to access maintenance, software updates and battery health checks. Evaluate whether this is the best decision for UrbanGlide.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers analyse subscription revenue stability + customer loyalty + brand differentiation against operational risk (technician capacity, scheduling/payment systems, churn from poor service) and competitor behaviour. Conditional on operational capacity and demand signal for the service.",
		answers: [
			{
				id: "L1",
				text: "A subscription plan could help UrbanGlide because customers pay every month which gives the business more money. It also means the scooters stay in good condition. But people might not want to pay every month and cancel it. UrbanGlide might need more workers to do the checks which costs money. So it could be good or bad depending if customers like the idea.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Generic AO1",
					"No real AO2",
					"No chains of reasoning",
					"No evaluation structure",
					"Judgement meaningless",
				],
			},
			{
				id: "L2",
				text: "Launching a subscription plan could help UrbanGlide earn regular income instead of just making money from one-off scooter sales. This is useful because it gives the business more predictable revenue each month. Customers might also like the idea of regular maintenance because it keeps their scooter safe and working well, which builds trust in the brand.\nHowever, delivering regular maintenance and battery checks will increase UrbanGlide's workload. They will need staff who can carry out checks, and they may need more tools or equipment. If many people join the subscription but UrbanGlide does not have enough technicians, customers may experience delays. This could lead to complaints or cancellations.\nOverall, the subscription plan could help UrbanGlide if customers want ongoing support, but it also creates extra costs and pressure.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 solid",
					"AO2 applied but shallow",
					"Limited evaluation",
					"Judgement not justified",
					"No deep financial/operational analysis",
				],
			},
			{
				id: "L3",
				text: "Launching a subscription plan could provide UrbanGlide with a stable and predictable revenue stream, which is particularly useful in a market where scooter sales fluctuate depending on seasonality and disposable income. Regular monthly payments would help UrbanGlide plan cash flow and invest confidently in future product development. The subscription may also improve customer loyalty. If customers are tied into a maintenance plan, they are less likely to switch to rival brands. Regular software updates and battery health checks can also extend the scooter's lifespan, which enhances UrbanGlide's reputation for reliability. Over time, this could differentiate the business in a competitive commuter-scooter market.\nHowever, subscription models also create operational and financial risks. UrbanGlide must have sufficient skilled technicians to complete maintenance and battery diagnostics across a large customer base. If the business underestimates labour requirements, customers may face long waiting times, which increases frustration and leads to cancellations. Subscription services also rely on smooth digital management systems for monthly payments, reminders and booking appointments; setting this up requires investment in software and customer service infrastructure. Additionally, the business must consider churn rates. If customers subscribe initially but quickly cancel due to poor communication, long waiting lists or limited benefits, UrbanGlide may not recoup the costs of setting up the service.\nOverall, a subscription plan is a good decision if UrbanGlide has strong operational capacity, reliable scheduling systems and clear evidence that customers value long-term maintenance support. If the business cannot guarantee high service quality or if customers are unwilling to pay a monthly fee, the costs and risks may outweigh the benefits. Therefore, the decision depends on customer demand, maintenance capacity and UrbanGlide's ability to deliver consistent service.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"Excellent AO1 (churn, capacity, systems, seasonality)",
					"Strong AO2 (commuter market, digital systems, battery diagnostics)",
					"Deep chains of reasoning",
					"Full evaluation",
					"Contextualised conditional judgement",
					"Realistic examiner length ~280–300 words",
				],
			},
			{
				id: "Fake-L3",
				text: "A subscription plan could help UrbanGlide because customers pay every month, giving the business more stable income. Customers might also like having their scooter checked often, as it means the scooter stays in good condition. This could help UrbanGlide build trust and make customers stay with the brand.\nHowever, the business would have to spend money hiring extra workers or buying equipment to do the checks. If lots of customers join, it might become difficult to keep up with all the appointments. Some customers may also cancel the subscription if they don't find it useful.\nOverall I think it is a good idea because more people will want to join if they want their scooter looked after.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 generic and shallow",
					"Analysis weak and single-layered",
					"No multi-step consequences",
					"No detailed evaluation",
					"Judgement unjustified",
					"→ Capped at L2",
				],
			},
		],
	},

	// ── ByteTech Repairs ─────────────────────────────────────────────────────
	{
		id: "bytetech-q1",
		businessName: "ByteTech Repairs",
		businessContext: "Device repair shop (phones, tablets, computers).",
		questionText:
			"ByteTech Repairs is considering offering a 'no-fix, no-fee' guarantee on all device repairs. Evaluate whether this is the best decision for the business.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers weigh increased enquiries (customers reassured against diagnostic fees, competitor differentiation) against operational/financial risk (technician time wasted on unfixable devices, attracted by 'nothing to lose' customers with severely damaged hardware, board-level repair costs, slowdown for paying customers). Conditional on terms management, eligible-device controls and repair success rates.",
		answers: [
			{
				id: "L1",
				text: "Doing a no-fix no-fee guarantee could help ByteTech because customers will like it if they don't have to pay when their phone can't be repaired. More people might choose them. But it could be bad because ByteTech might spend time trying to fix things and then get no money. They might waste money on parts too. It could be good but also risky.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Very basic AO1",
					"AO2 almost zero",
					"No chain of reasoning",
					"No proper evaluation",
					"No meaningful judgement",
				],
			},
			{
				id: "L2",
				text: "Offering a no-fix, no-fee guarantee could attract more customers because people are often worried about repair shops charging them even if the phone cannot be repaired. This guarantee makes ByteTech look more trustworthy, which could increase the number of customers bringing in damaged devices.\nHowever, this guarantee could cost ByteTech money. Some devices, like phones with water damage or dead motherboards, are very hard to fix. ByteTech might spend time diagnosing the issue and using parts or tools but then earn nothing if the device cannot be repaired. If too many customers bring in devices that can't be fixed, the business may lose profit.\nOverall, the idea could increase customer numbers but also create financial risks if repairs are unsuccessful.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 correct",
					"AO2 partially applied",
					"Some evaluation but shallow",
					"Judgement not fully justified",
					"Missing detailed consequences",
					"Weak development",
				],
			},
			{
				id: "L3",
				text: "Introducing a no-fix, no-fee guarantee could make ByteTech Repairs far more attractive to customers who are nervous about repair costs. Many people bring in devices with uncertain faults, especially water-damaged phones, logic-board failures or devices that won't turn on. These repairs often have unpredictable outcomes, and customers may be scared of paying for diagnostics with no guarantee of success. By removing this risk, ByteTech could significantly increase the number of enquiries it receives, especially compared to competitors who charge diagnostic fees. This may improve overall revenue if a larger proportion of devices turn out to be fixable.\nHowever, the guarantee also introduces financial and operational risks. ByteTech technicians still need to spend time diagnosing devices, even when they ultimately cannot be repaired. This labour time carries a cost, and if many devices are unrepairable, the business may lose money through wasted technician hours. There is also a risk that customers bring in very old or severely damaged devices simply because there is 'nothing to lose.' These repairs often require specialist tools or board-level components that are expensive. If ByteTech attempts these high-risk repairs but cannot complete them, profit margins will fall. Additionally, an influx of difficult repairs may slow down turnaround times for paying customers, damaging satisfaction and online reviews.\nOverall, the no-fix, no-fee guarantee is a good decision if ByteTech carefully controls which devices are eligible and sets clear terms. For example, water-damaged or physically snapped devices could still incur a small diagnostic fee. If managed properly, the guarantee could improve customer trust and increase repair volume. If ByteTech applies the policy too broadly or cannot manage technician workload, the financial risk may outweigh the benefits. The decision ultimately depends on repair success rates and technician capacity.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"Excellent AO1 (diagnostics, labour costs, logic-board failures)",
					"Strong AO2 (customer fear, competitor comparison, repair types)",
					"Multi-step chains of reasoning",
					"Full, balanced evaluation",
					"Contextual, conditional judgement",
					"Realistic top-band length",
				],
			},
			{
				id: "Fake-L3",
				text: "A no-fix, no-fee guarantee could help ByteTech because customers feel safer knowing they won't have to pay if the repair fails. This could increase the number of people who come to the shop. It also helps the business look honest and trustworthy.\nHowever, if the device cannot be fixed, ByteTech will not make any money. They might spend time diagnosing the problem but still get no payment. They could also get lots of devices that are very damaged because customers think it's worth a try. This might slow down the business and cause issues.\nOverall I think it is a good idea because customers will like it and it will make ByteTech more popular.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 shallow",
					"Repeated reasoning",
					"Evaluation superficial",
					"No multi-step analysis",
					"Weak judgement",
					"→ Capped at L2",
				],
			},
		],
	},
	{
		id: "bytetech-q2",
		businessName: "ByteTech Repairs",
		businessContext: "Device repair shop (phones, tablets, computers).",
		questionText:
			"ByteTech Repairs is considering offering same-day repair for common faults such as screen replacements and battery swaps. Evaluate whether this is the best decision for the business.",
		totalMarks: 9,
		commandWord: "Evaluate",
		templateKey: "aqa-9-mark-evaluate",
		indicativeContent:
			"Strong answers analyse competitiveness on urgency-driven demand (smartphones for work/payments/transport) and economies via bulk-buying common parts, against pressure on staffing/inventory/workflow (overstock risk if demand misforecast, complex jobs displaced). Conditional on capacity to meet demand consistently and accurate parts forecasting.",
		answers: [
			{
				id: "L1",
				text: "Offering same-day repairs could help ByteTech because customers want their phones back quickly. This might make more people come to the shop. But it could also be bad because they might rush the repairs or not have enough staff. It could be very busy and they might not finish everything in time. It might be good or bad depending on how many workers they have.",
				expected: { level: 1, markMin: 1, markMax: 3, isTrap: false },
				whyNotes: [
					"Very basic AO1 only",
					"Minimal AO2 (almost none)",
					"No real analysis",
					"No evaluation structure",
					"Judgement is vague",
				],
			},
			{
				id: "L2",
				text: "Offering same-day repairs could help ByteTech because many customers want their phone fixed quickly. People rely on their phones for work and communication, so fast repairs could attract more customers. It also makes ByteTech seem more reliable than shops that take several days. This could increase revenue if more people choose them.\nHowever, same-day repairs may require more technicians or longer working hours. ByteTech might also need to keep more spare parts in stock, which costs money. If too many customers arrive on the same day, there may be long waiting times which could lead to complaints. If technicians rush repairs to meet deadlines, mistakes could happen and this would damage the business's reputation.\nOverall, same-day repairs could increase customer numbers but also put pressure on staff and resources.",
				expected: { level: 2, markMin: 4, markMax: 6, isTrap: false },
				whyNotes: [
					"AO1 correct",
					"AO2 applied (customer urgency, parts stock)",
					"Evaluation present but shallow",
					"Judgement weak",
					"Limited depth",
				],
			},
			{
				id: "L3",
				text: "Introducing same-day repairs could significantly improve ByteTech's competitiveness. Customers increasingly rely on their phones for work, payments and transport, so speed is a major factor when choosing a repair shop. By offering same-day service for common faults such as screen repairs and battery replacements, ByteTech could attract customers who would otherwise choose national chains or mobile repair vans. Faster turnaround times may also enable the business to serve more customers per week, increasing overall revenue. Keeping more parts in stock could also reduce downtime and allow ByteTech to negotiate bulk-buying discounts, lowering the average cost per repair.\nHowever, same-day repairs place considerable pressure on staffing, inventory and workflow. ByteTech would need enough skilled technicians available throughout the day to meet promised turnaround times. If demand suddenly increases, technicians may become overwhelmed, leading to rushed repairs, mistakes or missed deadlines—all of which could harm online reviews. Maintaining large stocks of screens and batteries is expensive and ties up working capital, particularly because different phone models require different parts. If the business overestimates demand, unsold parts may become outdated quickly, leading to financial losses. Additionally, prioritising same-day repairs may disrupt existing work processes, delaying more complex jobs that require additional time.\nOverall, offering same-day repairs is a good decision if ByteTech has the capacity to meet demand consistently and can accurately forecast which parts and models are most commonly required. If the business controls workflow and maintains quality standards, the service could increase customer satisfaction and revenue. However, if staffing or inventory is insufficient, the pressure may create mistakes and reputational damage. The decision ultimately depends on technician capacity, stock management and demand predictability.",
				expected: { level: 3, markMin: 7, markMax: 9, isTrap: false },
				whyNotes: [
					"AO1 excellent (inventory, bulk-buying, workflow)",
					"AO2 strongly applied (smartphones, urgency, stock risk)",
					"Multi-step reasoning",
					"Balanced, contextual evaluation",
					"Clear conditional judgement",
					"Realistic near-300-word length",
				],
			},
			{
				id: "Fake-L3",
				text: "Offering same-day repairs could help ByteTech because customers want fast service and will choose a shop that can fix their phone quickly. This could bring in more customers and help the business grow.\nHowever, it also creates problems. ByteTech might not have enough staff to repair phones on the same day. They also need to keep more parts in stock which costs money. If too many people want repairs, the business may not finish everything on time and customers could become annoyed.\nOverall I think it is a good idea because it helps customers get their devices back faster.",
				expected: { level: 2, markMin: 4, markMax: 5, isTrap: true },
				whyNotes: [
					"AO2 is generic",
					"No detailed consequences",
					"No multi-step analysis",
					"Weak evaluation",
					"Judgement not justified",
					"→ Capped at L2",
				],
			},
		],
	},
]
