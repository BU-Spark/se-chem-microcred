import { fireEvent, render, screen } from '@testing-library/react';

import SurveyModal, { type SurveyModalClassNames } from './index';

const classNames: SurveyModalClassNames = {
  overlay: 'overlay',
  modal: 'modal',
  close: 'close',
  title: 'title',
  question: 'question',
  error: 'error',
  options: 'options',
  option: 'option',
  selectedOption: 'selected',
  optionImage: 'image',
  selectedOptionImage: 'selectedImage',
  submit: 'submit',
};

const options = [
  {
    value: 1,
    label: 'Unhappy',
    icon: { src: '/unhappy.svg', width: 32, height: 32 },
    selectedIcon: { src: '/unhappy-selected.svg', width: 32, height: 32 },
  },
  {
    value: 2,
    label: 'Happy',
    icon: { src: '/happy.svg', width: 32, height: 32 },
    selectedIcon: { src: '/happy-selected.svg', width: 32, height: 32 },
  },
];

describe('SurveyModal', () => {
  it('renders the selected option and reports changes', () => {
    const onChange = jest.fn();
    render(
      <SurveyModal
        title="Tell us what you think"
        question="How was it?"
        options={options}
        value={1}
        onChange={onChange}
        onSubmit={jest.fn()}
        classNames={classNames}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Tell us what you think' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unhappy' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Happy' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('submits, closes, and displays an accessible error', () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    render(
      <SurveyModal
        title="Survey"
        question="How was it?"
        options={options}
        value={2}
        onChange={jest.fn()}
        onSubmit={onSubmit}
        onClose={onClose}
        error="Please try again."
        classNames={classNames}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Do this later' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again.');
  });

  it('uses the submitting state and supports a required survey without close', () => {
    render(
      <SurveyModal
        title="Lesson survey"
        question="How was it?"
        options={options}
        value={1}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        submitLabel="Submit feedback"
        isSubmitting
        classNames={classNames}
      />
    );

    expect(screen.queryByRole('button', { name: 'Do this later' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
  });
});
