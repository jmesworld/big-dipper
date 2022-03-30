
import chai from 'chai';
import { separateDecimals, separateFractions } from './regex-formatting.js';

// Tests running with '$ meteor test --driver-package meteortesting:mocha'

describe('TestingRegexFormatting', () => {
  const rawNumber = "990099000000364464707672596"
  const oneCudo = "1000000000000000000"
  const fractionedOneCudo = "1.000000000000000000"
  const humanReadableOneCudo = "1.0"
  const smallRawNumber = "999999999999999999"
  const leadingZeroFractionedSmallNumber = "0.999999999999999999"
  const fractionNumber = "990099000.000364464707672596"
  const decimalSeparatedNumber = "990,099,000.000364464707672596"
  const largeCudosAmountWithTrailingZeroes = "990099000000364464700001000"
  const humanReabableLargeAmount = "990,099,000.000364464700001"
  const keplrReadyLargeAmount = "990099000.000364464700001000"
  
  it('rawNumber should change to fractionedNumber', () => {
    const result = separateFractions(rawNumber);
    chai.expect(result).to.equal(fractionNumber);
    // 990099000000364464707672596 => 990099000.000364464707672596
  });

  it('fractionedNumber should change to decimalSeparatedNumber', () => {
    const result = separateDecimals(fractionNumber);
    chai.expect(result).to.equal(decimalSeparatedNumber);
    // 990099000.000364464707672596 => 990,099,000.000364464707672596
  });

  it('rawNumber should change to fractioned decimalSeparatedNumber', () => {
    const result = separateDecimals(separateFractions(rawNumber));
    chai.expect(result).to.equal(decimalSeparatedNumber);
    // 990099000000364464707672596 => 990,099,000.000364464707672596
  });

  it('1 CUDO should consists of 19 digits', () => {
    const result = oneCudo.length
    chai.expect(result).to.equal(19);
    // oneCudo = 1000000000000000000
  });

  it('1 CUDO should be fractioned', () => {
    const result = separateFractions(oneCudo)
    chai.expect(result).to.equal(fractionedOneCudo);
    // 1000000000000000000 => 1.000000000000000000
  });

  it('1 CUDO should be humanReadableOneCudo', () => {
    const result = separateDecimals(separateFractions(oneCudo))
    chai.expect(result).to.equal(humanReadableOneCudo);
    // 1000000000000000000 => 1.0
  });

  it('small rawNumber < 1 CUDO should have lenght of 18 digits', () => {
    const result = smallRawNumber.length;
    chai.expect(result).to.equal(18);
    // smallRawNumber = 999999999999999999
  });

  it('small rawNumber < 1 CUDO should change to fractioned number with leading 0', () => {
    const result = separateFractions(smallRawNumber);
    chai.expect(result).to.equal(leadingZeroFractionedSmallNumber);
    // 999999999999999999 => 0.999999999999999999
  });

  it('large rawNumber > 990,099,000.00 CUDOS should change to humanReadable', () => {
    const result = separateDecimals(separateFractions(largeCudosAmountWithTrailingZeroes));
    chai.expect(result).to.equal(humanReabableLargeAmount);
    // 990099000000364464700001000 => 990,099,000.000364464700001
  });

  it('large rawNumber should change to Keplr ready fractioned format', () => {
    const result = separateFractions(largeCudosAmountWithTrailingZeroes);
    chai.expect(result).to.equal(keplrReadyLargeAmount);
    // 990099000000364464700001000 => 990099000.000364464700001
  });

});
