import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/60 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  }
  const variants = {
    primary: 'bg-rose-500 text-stone-950 hover:bg-rose-400',
    secondary: 'bg-stone-800 text-stone-200 hover:bg-stone-700 border border-stone-700',
    ghost: 'text-stone-400 hover:text-stone-100 hover:bg-stone-800',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export default Button
