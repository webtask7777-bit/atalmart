"use client";

import {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

type BaseProps = {
  label?: string;
  error?: string;
};

type InputModeProps = BaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    as?: "input";
  };

type TextareaModeProps = BaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: "textarea";
    rows?: number;
  };

type InputProps = InputModeProps | TextareaModeProps;

/**
 * Combined input + textarea field. Pass `as="textarea"` to render a multi-line
 * version (used for descriptions, return policies, etc.). The shared styling
 * keeps both visually consistent with the rest of the admin/customer forms.
 */
export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  function Input(props, ref) {
    const { label, error, className = "" } = props;
    const sharedClasses = `
      w-full px-4 py-3 rounded-xl border-2 border-gray-200
      bg-white text-brown placeholder:text-gray-400
      focus:outline-none focus:border-saffron focus:ring-1 focus:ring-saffron
      transition-colors
      ${error ? "border-red-400 focus:border-red-400 focus:ring-red-400" : ""}
      ${className}
    `;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-brown-light mb-1.5">
            {label}
          </label>
        )}
        {props.as === "textarea" ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            className={sharedClasses}
            {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={sharedClasses}
            {...(props as InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  },
);
