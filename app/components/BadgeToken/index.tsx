import type { ReactNode } from 'react';

type BadgeTokenProps = {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'span';
};

export default function BadgeToken({ children, className, as: Element = 'div' }: BadgeTokenProps) {
  return <Element className={className}>{children}</Element>;
}
