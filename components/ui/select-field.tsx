"use client";

import * as React from "react";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectFieldOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type SelectFieldProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Application form adapter around the current COSS/Base UI Select primitive.
 * It keeps controlled string-field ergonomics while retaining a real listbox,
 * keyboard navigation, focus management, and consistent trigger sizing.
 */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectFieldProps) {
  return (
    <Select
      disabled={disabled}
      items={options}
      onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
      value={value}
    >
      <SelectTrigger className={className} id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
