import { redirect } from 'next/navigation';

type BadgesCreationRedirectPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function toSearchString(searchParams?: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  if (!searchParams) {
    return '';
  }

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
      continue;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  }

  return params.toString();
}

export default function BadgesCreationRedirectPage({ searchParams }: BadgesCreationRedirectPageProps) {
  const query = toSearchString(searchParams);
  redirect(query ? `/badge_creation?${query}` : '/badge_creation');
}
