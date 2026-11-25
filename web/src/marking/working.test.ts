import { describe, expect, test } from 'vitest';
import { evaluateArithmetic, operationSignature, substitutedArithmetic, workingContradictsKey } from './working';

describe('the working a student substituted', () => {
  test('finds the last arithmetic step', () => {
    expect(substitutedArithmetic('v = f/λ = 50/0.4 = 125 m/s')).toBe('50/0.4');
    expect(substitutedArithmetic('v = fλ = 50 × 0.4 = 20 m/s')).toBe('50*0.4');
    expect(substitutedArithmetic('P = hρg = 10 x 1000 x 10 = 100000')).toBe('10*1000*10');
    expect(substitutedArithmetic('20 m/s')).toBeNull();
    expect(substitutedArithmetic('v = fλ = 20')).toBeNull();
    expect(substitutedArithmetic('P=hρg=10X1000X1=10,000Pa')).toBe('10*1000*1');
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

describe('the operations a formula uses (multiplication and powers are left implicit in written formulas)', () => {
  test('reads them from the guide and from the working', () => {
    expect(operationSignature('uses a = (v − u) ÷ t')).toBe('-/');
    expect(operationSignature('uses P = hρg')).toBe('');
    expect(operationSignature('s = ½(u + v)t')).toBe('+');
    expect(operationSignature('1/2*(0+20)*5')).toBe('+');
    expect(operationSignature('50/0.4')).toBe('/');
    expect(operationSignature('0+1/2*4*5^2')).toBe('+');
  });
});

// The four real handwritten WAEC scripts (samples/waec-handwritten), method points as drafted from guide.txt.
describe('real scripts: a wrong number in the right formula is a slip, a different operation is a different formula', () => {
  const SPEED = ['uses v = fλ'];
  const PRESSURE = ['uses P = hρg'];
  const ENERGY = ['uses PE = mgh'];
  const CURRENT = ['total resistance 4 + 2 = 6 Ω, or I = V ÷ R with 6 Ω'];
  const ACCEL = ['uses a = (v − u) ÷ t'];
  test('Script 2 Q9: P = hρg with one value wrong (× 1) keeps its chance of a method mark', () => {
    expect(workingContradictsKey('P=hρg=10X1000X1=10,000Pa', 10000, [100000], PRESSURE)).toBeNull();
  });
  test('Script 2 Q10 read as 2 × 10 × 50: same formula, a wrong number', () => {
    expect(workingContradictsKey('PE=mgh=2X10X50=1000J', 1000, [100], ENERGY)).toBeNull();
  });
  test('Script 2 Q8(b): writes v = fλ but divides — a different formula', () => {
    expect(workingContradictsKey('V=fλ=50/0.4=125 m/s', 125, [20], SPEED)).toEqual({ step: '50/0.4', value: 125 });
  });
  test('Script 2 Q7(b): multiplies the resistances (an earlier step) — a different formula', () => {
    expect(workingContradictsKey('R=4X2=8Ω I=12/8=1.5A', 1.5, [2], CURRENT)).toEqual({ step: '4*2', value: 8 });
  });
  test('Script 2 Q6(b)(i): 20 × 5 where the formula subtracts and divides', () => {
    expect(workingContradictsKey('a=20X5=100m/s^2', 100, [4], ACCEL)).toEqual({ step: '20*5', value: 100 });
  });
  test('an arithmetic slip in the right formula is never a contradiction', () => {
    expect(workingContradictsKey('P = ρgh = 10 x 1000 x 10 = 10 x 10^5 Pa', 1000000, [100000], PRESSURE)).toBeNull();
  });
});
