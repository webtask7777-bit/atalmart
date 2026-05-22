type Variant = "saffron" | "green" | "red" | "gray" | "navy";

const variantClasses: Record<Variant, string> = {
  saffron: "bg-saffron-light text-saffron-dark",
  green: "bg-green-light text-indian-green",
  red: "bg-red-50 text-red-600",
  gray: "bg-gray-100 text-gray-600",
  navy: "bg-blue-50 text-navy",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "saffron",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
