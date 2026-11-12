package app.redpen.teacher.data

import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Question

/** Same samples as web/src/data/samples.ts. */
object Samples {
    data class Sample(val title: String, val className: String, val scheme: MarkingScheme)

    val all = listOf(
        Sample("Mental Maths — Week 9", "Primary 6A", MarkingScheme("Mathematics", "Primary 6", listOf(
            Question.Numeric(1, "7 × 8", 1, listOf(56.0)),
            Question.Numeric(2, "15 + 9", 1, listOf(24.0)),
            Question.Numeric(3, "144 ÷ 12", 1, listOf(12.0)),
            Question.Numeric(4, "3/4 + 1/4", 1, listOf(1.0)),
            Question.Numeric(5, "25% of 80", 1, listOf(20.0)),
            Question.Numeric(6, "6 crates of eggs at ₦4,500 each — total cost?", 2, listOf(27000.0), methodPoints = listOf("multiplies 6 by 4,500 (or 4500 × 6)")),
        ))),
        Sample("Blood and the Liver — Class Test", "JSS 3B", MarkingScheme("Basic Science", "JSS 3", listOf(
            Question.Points(1, "State two functions of blood.", 2, listOf("transports or carries oxygen", "fights germs, infection or disease", "transports food or nutrients", "transports waste or carbon dioxide", "helps blood to clot")),
            Question.Points(2, "State three functions of the liver.", 3, listOf("produces or makes bile", "stores glycogen, sugar or glucose", "removes toxins or detoxifies", "deamination of excess amino acids", "produces heat")),
            Question.Short(3, "Name the process by which green plants make their food.", 1, listOf("photosynthesis")),
            Question.Points(4, "What is the function of the red blood cell?", 1, listOf("transports or carries oxygen"), listOf("fights disease (that is the white blood cell)")),
        ))),
        Sample("English — Grammar Check", "JSS 1A", MarkingScheme("English Language", "JSS 1", listOf(
            Question.Objective(1, "The plural of 'child' is: (A) childs (B) children (C) childrens (D) child's", 1, listOf("B")),
            Question.Objective(2, "The opposite of 'ancient' is: (A) old (B) aged (C) antique (D) modern", 1, listOf("D")),
            Question.Objective(3, "She ___ to school every day: (A) goes (B) go (C) going (D) gone", 1, listOf("A")),
            Question.Short(4, "The capital of Nigeria is ___", 1, listOf("Abuja")),
            Question.Short(5, "Past tense of 'run'", 1, listOf("ran"), listOf("runned"), spellingTolerant = false),
        ))),
    )
}
