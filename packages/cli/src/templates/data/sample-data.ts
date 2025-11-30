/**
 * data/sample-data.json template
 */

export function generateSampleData(): object[] {
  return [
    {
      id: 'test-001',
      question: 'What is the capital of France?',
      context: 'France is a country in Western Europe. Its capital city is known for the Eiffel Tower.',
      expectedOutput: 'Paris',
    },
    {
      id: 'test-002',
      question: 'What is 2 + 2?',
      context: 'Basic arithmetic operations involve addition, subtraction, multiplication, and division.',
      expectedOutput: '4',
    },
    {
      id: 'test-003',
      question: 'Who wrote Romeo and Juliet?',
      context: 'Romeo and Juliet is a famous tragedy written in the late 16th century by an English playwright.',
      expectedOutput: 'William Shakespeare',
    },
  ];
}

