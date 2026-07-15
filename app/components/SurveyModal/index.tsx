'use client';

import Image, { type ImageProps } from 'next/image';

import Modal from '../Modal';

export type SurveyOption = {
  value: number;
  label: string;
  icon: ImageProps['src'];
  selectedIcon?: ImageProps['src'];
};

export type SurveyModalClassNames = {
  overlay: string;
  modal: string;
  close?: string;
  title: string;
  question: string;
  error?: string;
  options: string;
  option: string;
  selectedOption: string;
  optionImage: string;
  selectedOptionImage: string;
  submit: string;
};

type SurveyModalProps = {
  title: string;
  question: string;
  options: readonly SurveyOption[];
  value: number;
  onChange: (value: number) => void;
  onSubmit: () => void;
  classNames: SurveyModalClassNames;
  submitLabel?: string;
  submittingLabel?: string;
  isSubmitting?: boolean;
  error?: string | null;
  errorAfterOptions?: boolean;
  onClose?: () => void;
  closeLabel?: string;
};

export default function SurveyModal({
  title,
  question,
  options,
  value,
  onChange,
  onSubmit,
  classNames,
  submitLabel = 'Submit',
  submittingLabel = 'Submitting…',
  isSubmitting = false,
  error,
  errorAfterOptions = false,
  onClose,
  closeLabel = 'Do this later',
}: SurveyModalProps) {
  const close = onClose ?? (() => undefined);

  return (
    <Modal
      overlayClassName={classNames.overlay}
      className={classNames.modal}
      onClose={close}
      ariaLabel={title}
      closeOnEscape={Boolean(onClose)}
      closeOnOverlayClick={false}
    >
      {onClose ? (
        <button type="button" className={classNames.close} onClick={onClose}>
          {closeLabel}
        </button>
      ) : null}

      <h2 className={classNames.title}>{title}</h2>
      <p className={classNames.question}>{question}</p>

      {error && !errorAfterOptions ? (
        <p className={classNames.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={classNames.options}>
        {options.map((option) => {
          const isSelected = value === option.value;
          const optionClassName = [classNames.option, isSelected ? classNames.selectedOption : '']
            .filter(Boolean)
            .join(' ');
          const imageClassName = [classNames.optionImage, isSelected ? classNames.selectedOptionImage : '']
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={option.value}
              type="button"
              className={optionClassName}
              onClick={() => onChange(option.value)}
              aria-pressed={isSelected}
              aria-label={option.label}
            >
              <Image
                src={isSelected ? (option.selectedIcon ?? option.icon) : option.icon}
                alt={option.label}
                className={imageClassName}
              />
            </button>
          );
        })}
      </div>

      {error && errorAfterOptions ? (
        <p className={classNames.error} role="alert">
          {error}
        </p>
      ) : null}

      <button type="button" className={classNames.submit} onClick={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </Modal>
  );
}
