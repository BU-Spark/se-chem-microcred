import { hasVisibleQuestionText, sanitizeQuestionRichText } from './question-rich-text';

describe('question rich text', () => {
  it('preserves supported scientific formatting', () => {
    expect(sanitizeQuestionRichText('<p><strong>H</strong><sub>2</sub>O<sup>+</sup></p>')).toBe(
      '<p><strong>H</strong><sub>2</sub>O<sup>+</sup></p>'
    );
  });

  it('removes unsafe tags and attributes', () => {
    expect(
      sanitizeQuestionRichText('<p onclick="alert(1)">Safe</p><script>alert(1)</script><a href="bad">text</a>')
    ).toBe('<p>Safe</p>text');
  });

  it('wraps and escapes legacy plain-text prompts', () => {
    expect(sanitizeQuestionRichText('Is 2 < 3?')).toBe('<p>Is 2 &lt; 3?</p>');
    expect(hasVisibleQuestionText('<p><br></p>')).toBe(false);
  });
});
