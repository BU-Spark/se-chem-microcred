import { ButtonProps } from './Button.types';
import styles from './Button.module.css';
import { clsx } from 'clsx';

export const Button = ({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  onClick,
  className,
}: ButtonProps) => {
  return (
    <button
      className={clsx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
