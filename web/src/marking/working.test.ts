import { describe, expect, test } from 'vitest';
import { evaluateArithmetic, substitutedArithmetic, workingContradictsKey } from './working';

describe('the working a student substituted', () => {
  test('finds the last arithmetic step', () => {
    expect(substitutedArithmetic('v = f/λ = 50/0.4 = 125 m/s')).toBe('50/0.4');
    expect(substitutedArithmetic('v = fλ = 50 × 0.4 = 20 m/s')).toBe('50*0.4');
    expect(substitutedArithmetic('P = hρg = 10 x 1000 x 10 = 100000')).toBe('10*1000*10');
    expect(substitutedArithmetic('20 m/s')).toBeNull();
    expect(substitutedArithmetic('v = fλ = 20')).toBeNull();
  });
  test('evaluates it', () => {
    expect(evaluateArithmetic('50/0.4')).toBe(125);
    expect(evaluateArithmetic('(4+2)*2')).toBe(12);
    expect(evaluateArithmetic('2*10^3')).toBe(2000);
    expect(evaluateArithmetic('50/')).toBeNull();
  });
});

describe('a method mark needs working that follows the key', () => {
  test('a different relationship worked out correctly contradicts the key', () => {
    expect(workingContradictsKey('v = fλ = 50/0.4 = 125 m/s', 125, [20])).toEqual({ step: '50/0.4', value: 125 });
  });
  test('an arithmetic slip does not', () => {
    expect(workingContradictsKey('v = fλ = 50 × 0.4 = 25 m/s', 25, [20])).toBeNull();
  });
  test('no working, or working that gives the key, does not', () => {
    expect(workingContradictsKey('125 m/s', 125, [20])).toBeNull();
    expect(workingContradictsKey('I = 12/6 = 2 A', 2, [2])).toBeNull();
  });
});
