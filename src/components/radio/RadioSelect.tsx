import { useId } from "react";
import "./RadioSelect.css";

export type RadioOption = {
	id: string;
	label: string;
	value: unknown;
};

export default function RadioSelect(props: {
	name?: string;
	value: unknown;
	options: RadioOption[];
	onChange: (value: unknown) => void;
	required?: boolean;
	autoFocus?: boolean;
}) {
	const { value, onChange, autoFocus } = props;
	const options = props.options || [];
	const id = useId();
	return (
		<div className="form--RadioSelect">
			{options.map((option, index) => {
				return (
					<Option
						key={option.id}
						value={value}
						onChange={onChange}
						name={props.name || id}
						option={option}
						required={props.required === true}
						autoFocus={autoFocus && index === 0}
					/>
				);
			})}
		</div>
	);
}

function Option(props: {
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	option: RadioOption;
	autoFocus?: boolean;
	required?: boolean;
}) {
	const { option, autoFocus, value, onChange, name } = props;
	const optionValue = option.value ?? option.label;
	const inputValue = typeof optionValue === 'string' || typeof optionValue === 'number'
		? optionValue
		: String(optionValue);
	const isChecked = value === optionValue;
	return (
		<label key={option.id} className="form--RadioSelectOption" data-checked={isChecked === true}>
			<input
				type="radio"
				name={name}
				value={inputValue}
				checked={isChecked}
				onChange={(e) => onChange(e.target.value)}
				autoFocus={autoFocus}
				required={props.required}
			/>
			{option.label}
		</label>
	);
}
