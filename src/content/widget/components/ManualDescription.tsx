interface ManualDescriptionProps {
  description: string;
  onDescriptionChange: (desc: string) => void;
}

export function ManualDescription({
  description,
  onDescriptionChange,
}: ManualDescriptionProps) {
  return (
    <div>
      <label className="qa-label">Description</label>
      <textarea
        className="qa-textarea"
        placeholder="Describe the issue you found...&#10;&#10;e.g., The font-size on the header should be 16px instead of 14px, and the spacing between nav items needs to be 12px."
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={6}
      />
      <p className="text-xs text-gray-400 mt-1.5">
        This will be included in the Jira ticket description alongside any captured screenshots and CSS changes.
      </p>
    </div>
  );
}
