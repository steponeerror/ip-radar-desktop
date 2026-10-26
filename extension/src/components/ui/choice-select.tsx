import { Children, isValidElement, type ReactNode } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./select";
type Choice = { value: string; children: ReactNode; disabled?: boolean };
export function ChoiceOption(_props: Choice) {
  return null;
}
export function ChoiceSelect({
  id,
  value,
  onValueChange,
  children,
  maxVisibleItems,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  maxVisibleItems?: number;
}) {
  const items = Children.toArray(children)
    .filter(isValidElement<Choice>)
    .map((child) => ({
      value: child.props.value,
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(value) => {
        if (value !== null) onValueChange(value);
      }}
    >
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className={
          maxVisibleItems
            ? "[&_[data-slot=select-scroll-up-button]]:hidden [&_[data-slot=select-scroll-down-button]]:hidden"
            : undefined
        }
        style={
          maxVisibleItems
            ? {
                maxHeight: `min(var(--available-height), ${maxVisibleItems * 32 + 8}px)`,
              }
            : undefined
        }
      >
        <SelectGroup>
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              className={maxVisibleItems ? "h-8" : undefined}
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
