import { Textarea } from './ui/textarea';

interface ManualDescriptionProps {
  description: string;
  onDescriptionChange: (desc: string) => void;
}

export function ManualDescription({
  description,
  onDescriptionChange,
}: ManualDescriptionProps) {
  return (
    <Textarea
      className="border-slate-200 focus:border-slate-300 focus:ring-slate-100"
      placeholder="Describe the issue you found..."
      value={description}
      onChange={(e) => onDescriptionChange(e.target.value)}
      rows={4}
    />
  );
}
