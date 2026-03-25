import './ToggleSwitch.css';
import { localInstance } from 'src/i18n/locals';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function ToggleSwitch(props: ToggleSwitchProps) {
  const { checked, onChange, disabled = false, ariaLabel, className = '' } = props;

  const handleChange = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || (checked ? localInstance.enabled : localInstance.disabled)}
      disabled={disabled}
      className={`toggle-switch ${checked ? 'toggle-switch_checked' : ''} ${disabled ? 'toggle-switch_disabled' : ''} ${className}`.trim()}
      onClick={handleChange}
    >
      <span className="toggle-switch-slider" aria-hidden="true"></span>
    </button>
  );
}
