# GCSE AI Examiner - Database Entity Relationship Diagram

```mermaid
erDiagram
    QUESTIONS {
        ObjectId _id PK
        string question_text
        string topic
        string created_by
        Date created_at
        Date updated_at
        enum subject "biology|chemistry|physics|english"
        number points
        enum difficulty_level "easy|medium|hard|expert"
        array ancestors "parent question IDs"
        string part_label "e.g., a, b, c"
    }

    MARK_SCHEMES {
        ObjectId _id PK
        string question_id FK
        string description
        string guidance
        string created_by
        Date created_at
        Date updated_at
        number points_total
        array mark_points
    }

    MARK_POINTS {
        number point_number
        string description
        number points "always 1"
        string criteria
    }

    ANSWERS {
        ObjectId _id PK
        string question_id FK
        string student_id
        string student_answer
        Date submitted_at
        Date marked_at
        number total_score
        number max_possible_score
        enum marking_status "pending|completed|failed"
    }

    MARKING_RESULTS {
        ObjectId _id PK
        string answer_id FK
        array mark_points_results
        number total_score
        number max_possible_score
        Date marked_at
        string llm_reasoning
        string feedback_summary
    }

    MARK_POINT_RESULTS {
        number point_number
        boolean awarded
        string reasoning
        string expected_criteria
        string student_covered
    }

    %% Relationships
    QUESTIONS ||--o{ QUESTIONS : "has_parts"
    QUESTIONS ||--o{ MARK_SCHEMES : "has"
    MARK_SCHEMES ||--o{ MARK_POINTS : "contains"
    QUESTIONS ||--o{ ANSWERS : "receives"
    ANSWERS ||--o| MARKING_RESULTS : "evaluated_by"
    MARKING_RESULTS ||--o{ MARK_POINT_RESULTS : "contains"

    %% Notes
    %% MARK_POINTS is embedded in MARK_SCHEMES
    %% MARK_POINT_RESULTS is embedded in MARKING_RESULTS
    %% question_id in MARK_SCHEMES references QUESTIONS._id
    %% question_id in ANSWERS references QUESTIONS._id
    %% answer_id in MARKING_RESULTS references ANSWERS._id
```

## Database Schema Overview

This diagram represents the GCSE AI Examiner database schema with the following entities:

### Core Entities
- **QUESTIONS**: Stores exam questions with metadata like subject, topic, difficulty, and points
- **MARK_SCHEMES**: Contains marking criteria for each question with description and LLM instructions, linked to questions via question_id
- **ANSWERS**: Student submissions linked to questions via question_id
- **MARKING_RESULTS**: AI-generated marking results linked to answers via answer_id

### Embedded Sub-documents
- **MARK_POINTS**: Embedded in MARK_SCHEMES, defines individual marking criteria
- **MARK_POINT_RESULTS**: Embedded in MARKING_RESULTS, contains AI evaluation of each mark point

### Key Relationships
- Questions can have multiple sub-questions/parts (self-referencing one-to-many)
- Questions can have multiple mark schemes (one-to-many)
- Questions can receive multiple answers (one-to-many)
- Answers can have one marking result (one-to-one)
- Mark schemes contain multiple mark points (one-to-many)
- Marking results contain multiple mark point results (one-to-many)

### Data Flow
1. Questions are created with subject, topic, and difficulty (ancestors: [] for main questions)
2. Sub-questions/parts are created with ancestors array pointing to parent questions
3. Mark schemes are created for questions with detailed marking criteria
4. Students submit answers to questions (can be for main questions or sub-questions)
5. AI system evaluates answers against mark schemes
6. Marking results are generated with detailed feedback

### Hierarchical Structure Examples
- **Main Question**: ancestors: [], part_label: undefined
- **Question 1, Part A**: ancestors: ["question_id_1"], part_label: "a"
- **Question 1, Part A.1**: ancestors: ["question_id_1", "question_id_1a"], part_label: "1" 
