export interface ButtonProps {
  /**
   * The content to be displayed inside the button
   */
  children: React.ReactNode;
  /**
   * The variant of the button
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'outline';
  /**
   * The size of the button
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';
  /**
   * Whether the button is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Optional click handler
   */
  onClick?: () => void;
  /**
   * Optional className for custom styling
   */
  className?: string;
}
