// Ready-made assignments so a judge can try REDPEN in one click.
// They mirror the real handwriting samples used in our benchmark.
import type { MarkingScheme } from '../domain/types';

export interface SampleAssignment { title: string; className: string; scheme: MarkingScheme }

export const SAMPLES: SampleAssignment[] = [
  {
    title: 'Mental Maths — Week 9',
    className: 'Primary 6A',
    scheme: {
      subject: 'Mathematics',
      level: 'Primary 6',
      questions: [
        { q: 1, type: 'numeric', prompt: '7 × 8', max: 1, accept: [56] },
        { q: 2, type: 'numeric', prompt: '15 + 9', max: 1, accept: [24] },
        { q: 3, type: 'numeric', prompt: '144 ÷ 12', max: 1, accept: [12] },
        { q: 4, type: 'numeric', prompt: '3/4 + 1/4', max: 1, accept: [1] },
        { q: 5, type: 'numeric', prompt: '25% of 80', max: 1, accept: [20] },
        {
          q: 6, type: 'numeric', prompt: 'A trader buys 6 crates of eggs at ₦4,500 each. What is the total cost?', max: 2,
          accept: [27000], methodPoints: ['multiplies 6 by 4,500 (or 4500 × 6)'],
        },
      ],
    },
  },
  {
    title: 'Blood and the Liver — Class Test',
    className: 'JSS 3B',
    scheme: {
      subject: 'Basic Science',
      level: 'JSS 3',
      questions: [
        {
          q: 1, type: 'points', prompt: 'State two functions of blood.', max: 2,
          points: ['transports or carries oxygen', 'fights germs, infection or disease', 'transports food or nutrients', 'transports waste or carbon dioxide', 'helps blood to clot'],
        },
        {
          q: 2, type: 'points', prompt: 'State three functions of the liver.', max: 3,
          points: ['produces or makes bile', 'stores glycogen, sugar or glucose', 'removes toxins or detoxifies', 'deamination of excess amino acids', 'produces heat'],
        },
        { q: 3, type: 'short', prompt: 'Name the process by which green plants make their food.', max: 1, accept: ['photosynthesis'] },
        {
          q: 4, type: 'points', prompt: 'What is the function of the red blood cell?', max: 1,
          points: ['transports or carries oxygen'], reject: ['fights disease (that is the white blood cell)'],
        },
      ],
    },
  },
  {
    title: 'English — Grammar Check',
    className: 'JSS 1A',
    scheme: {
      subject: 'English Language',
      level: 'JSS 1',
      questions: [
        { q: 1, type: 'objective', prompt: "The plural of 'child' is: (A) childs (B) children (C) childrens (D) child's", max: 1, correct: ['B'] },
        { q: 2, type: 'objective', prompt: "The opposite of 'ancient' is: (A) old (B) aged (C) antique (D) modern", max: 1, correct: ['D'] },
        { q: 3, type: 'objective', prompt: 'She ___ to school every day: (A) goes (B) go (C) going (D) gone', max: 1, correct: ['A'] },
        { q: 4, type: 'short', prompt: 'The capital of Nigeria is ___', max: 1, accept: ['Abuja'] },
        { q: 5, type: 'short', prompt: "Past tense of 'run'", max: 1, accept: ['ran'], reject: ['runned'], spellingTolerant: false },
      ],
    },
  },
];
