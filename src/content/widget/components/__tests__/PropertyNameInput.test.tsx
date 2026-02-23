import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyNameInput } from '../PropertyNameInput';

describe('PropertyNameInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSelect: vi.fn(),
    onEscape: vi.fn(),
  };

  it('should render input with placeholder', () => {
    render(<PropertyNameInput {...defaultProps} />);
    expect(screen.getByPlaceholderText('property')).toBeInTheDocument();
  });

  it('should show dropdown when focused', () => {
    render(<PropertyNameInput {...defaultProps} />);
    const input = screen.getByPlaceholderText('property');
    fireEvent.focus(input);

    // Should show some CSS properties
    expect(screen.getByText('display')).toBeInTheDocument();
  });

  it('should filter properties based on input', () => {
    render(<PropertyNameInput {...defaultProps} value="flex" />);

    // Should show flex-related properties (text is split due to highlighting)
    const items = screen.getAllByRole('button');
    const itemTexts = items.map((item) => item.textContent);
    expect(itemTexts).toContain('flex-direction');
    expect(itemTexts).toContain('flex-wrap');
  });

  it('should prioritize prefix matches over includes', () => {
    render(<PropertyNameInput {...defaultProps} value="back" />);

    // "background" should appear before "backdrop-filter"
    const items = screen.getAllByRole('button');
    const backgroundIndex = items.findIndex((item) =>
      item.textContent?.includes('background')
    );
    const backdropIndex = items.findIndex((item) =>
      item.textContent?.includes('backdrop')
    );

    expect(backgroundIndex).toBeLessThan(backdropIndex);
  });

  it('should call onChange when typing', async () => {
    const onChange = vi.fn();
    render(<PropertyNameInput {...defaultProps} onChange={onChange} />);

    const input = screen.getByPlaceholderText('property');
    await userEvent.type(input, 'col');

    expect(onChange).toHaveBeenCalled();
  });

  it('should call onSelect when Enter is pressed', () => {
    const onSelect = vi.fn();
    render(<PropertyNameInput {...defaultProps} value="col" onSelect={onSelect} />);

    const input = screen.getByPlaceholderText('property');
    fireEvent.keyDown(input, { key: 'Enter' });

    // First match for "col" is "color" (prefix match)
    expect(onSelect).toHaveBeenCalled();
    // The first filtered item starting with "col" is "color"
    const calledWith = onSelect.mock.calls[0][0];
    expect(calledWith.startsWith('col')).toBe(true);
  });

  it('should call onSelect when Tab is pressed', () => {
    const onSelect = vi.fn();
    render(<PropertyNameInput {...defaultProps} value="dis" onSelect={onSelect} />);

    const input = screen.getByPlaceholderText('property');
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(onSelect).toHaveBeenCalledWith('display');
  });

  it('should call onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    render(<PropertyNameInput {...defaultProps} onEscape={onEscape} />);

    const input = screen.getByPlaceholderText('property');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalled();
  });

  it('should navigate with arrow keys', () => {
    render(<PropertyNameInput {...defaultProps} value="" />);

    const input = screen.getByPlaceholderText('property');
    fireEvent.focus(input);

    // First item should be highlighted initially
    const items = screen.getAllByRole('button');
    expect(items[0]).toHaveClass('highlighted');

    // Press ArrowDown
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(items[1]).toHaveClass('highlighted');

    // Press ArrowUp
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(items[0]).toHaveClass('highlighted');
  });

  it('should highlight matching text', () => {
    render(<PropertyNameInput {...defaultProps} value="pad" />);

    // Check that matches are highlighted
    const matchSpans = screen.getAllByText('pad');
    expect(matchSpans.length).toBeGreaterThan(0);
    matchSpans.forEach((span) => {
      expect(span).toHaveClass('qa-sp-autocomplete-match');
    });
  });

  it('should select on item click', () => {
    const onSelect = vi.fn();
    render(<PropertyNameInput {...defaultProps} value="mar" onSelect={onSelect} />);

    // Get the first button (which should be "margin" since it's a prefix match)
    const items = screen.getAllByRole('button');
    const marginItem = items.find((item) => item.textContent === 'margin');
    expect(marginItem).toBeDefined();
    fireEvent.mouseDown(marginItem!);

    expect(onSelect).toHaveBeenCalledWith('margin');
  });

  it('should highlight item on mouse enter', () => {
    render(<PropertyNameInput {...defaultProps} value="" />);
    fireEvent.focus(screen.getByPlaceholderText('property'));

    const items = screen.getAllByRole('button');
    fireEvent.mouseEnter(items[2]);

    expect(items[2]).toHaveClass('highlighted');
  });

  it('should limit results to 15 items', () => {
    render(<PropertyNameInput {...defaultProps} value="" />);
    fireEvent.focus(screen.getByPlaceholderText('property'));

    const items = screen.getAllByRole('button');
    expect(items.length).toBeLessThanOrEqual(15);
  });
});
