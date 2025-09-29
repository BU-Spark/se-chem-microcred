interface SkillPageProps {
  params: { skillId: string };
}

export default function SkillDetailPage({ params }: SkillPageProps) {
  return (
    <main>
      <h1>Skill Detail</h1>
      <p>Skill ID: {params.skillId}</p>
      <p>Detailed content for this skill is not yet implemented.</p>
    </main>
  );
}
