export interface FeatureCardProps {
  id: string;
  icon: string;
  title: string;
  description: string;
  details: React.ReactNode;
  isExpanded: boolean;
  onClick: (id: string) => void;
}
