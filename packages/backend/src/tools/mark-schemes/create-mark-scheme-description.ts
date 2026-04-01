export const CREATE_MARK_SCHEME_DESCRIPTION = `Create a new mark scheme for a GCSE question

    Example:
    Mark Scheme: Test for Yeast (4 marks)
Question: Describe how you would test to confirm the presence of yeast in a sample.
Mark Points:
1. Method/Procedure (1 mark)

Mentions adding the sample to glucose/sugar solution
OR mentions mixing yeast sample with sugar water
OR describes setting up fermentation test

2. Conditions Required (1 mark)

States warm temperature needed (e.g., 37°C, warm water bath, room temperature)
OR mentions anaerobic conditions (no oxygen/air excluded)
OR mentions suitable pH conditions

3. Observation/Results (1 mark)

Bubbles/gas produced
OR carbon dioxide given off
OR effervescence/fizzing observed
OR froth/foam formation

4. Confirmation Test (1 mark)

Test gas with limewater (turns milky/cloudy)
OR use pH indicator (solution becomes more acidic)
OR smell of alcohol/ethanol detected
OR use gas collection tube to capture CO₂

Additional Guidance:

Accept equivalent terms (e.g., "sugar" for glucose)
Do not accept vague terms like "reaction occurs" without specific observation
Time references (e.g., "after 10 minutes") can support but don't earn marks alone
Equipment mentions (test tubes, measuring cylinders) are supplementary but don't earn marks

Sample Chain-of-Thought Marking:
Student Response: "Mix the yeast with sugar water and leave in a warm place. Bubbles will form and you can test them with limewater which goes cloudy."
MARK POINT 1: Method/Procedure (1 mark)

Quote: "Mix the yeast with sugar water"
Analysis: Student describes basic fermentation setup
Criteria met: YES
Award: 1 mark
Running total: 1/4 marks

MARK POINT 2: Conditions Required (1 mark)

Quote: "leave in a warm place"
Analysis: Student mentions temperature requirement
Criteria met: YES
Award: 1 mark
Running total: 2/4 marks

MARK POINT 3: Observation/Results (1 mark)

Quote: "Bubbles will form"
Analysis: Student identifies gas production as key observation
Criteria met: YES
Award: 1 mark
Running total: 3/4 marks

MARK POINT 4: Confirmation Test (1 mark)

Quote: "test them with limewater which goes cloudy"
Analysis: Student describes CO₂ test with correct result
Criteria met: YES
Award: 1 mark
Running total: 4/4 marks

FINAL TOTAL: 4/4 marks
This mark scheme structure makes it easier for the LLM to work systematically through each component while maintaining clear criteria for each mark point.

CRITICAL RULES:
- Total marks awarded MUST NOT exceed {total_marks}
- Each mark point can only award 0 or 1 mark (no partial marks)
- If unsure between 0 or 1 mark, award 0 (conservative marking)
- Marks must sum exactly to your awarded total

PENALTY SYSTEM:
- If you can't find clear evidence in text: award 0 marks
- When in doubt, under-mark rather than over-mark
    `
