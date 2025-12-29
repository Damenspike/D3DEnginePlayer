import { DASH } from '../views/Inspector.jsx';

export default function InspTextStyle({
	objects,
	field,
	type,
	current,
	mixed,
	commitValue,
	systemFonts
}) {

	const webSafe = Array.isArray(field.options) ? field.options : [];
	const webSet = new Set(webSafe.map(o => o.name));

	const system = [];
	for(const name of systemFonts) {
		if(!name) continue;
		if(webSet.has(name)) continue;
		system.push({ name, label: name });
	}

	system.sort((a, b) => a.label.localeCompare(b.label));

	const selectValue = mixed ? DASH : (current || '');

	let desc = null;
	if(!mixed) {
		const opt = webSafe.find(o => o.name === selectValue);
		if(opt?.description) desc = opt.description;
	}

	const optionStyle = name => ({
		fontFamily: `"${name}", ${name}, sans-serif`,
		fontWeight: 400
	});

	return (
		<div className='insp-font'>
			<select
				className='tf insp-font__select'
				value={selectValue}
				onChange={e => commitValue(e.target.value)}
				disabled={field.readOnly}
			>
				{
					mixed && (
						<option value={DASH}>{DASH}</option>
					)
				}

				{
					webSafe.length > 0 && (
						<optgroup label='Web safe'>
							{
								webSafe.map((o, i) => (
									<option
										key={'w' + i}
										value={o.name}
										style={optionStyle(o.name)}
									>
										{o.label}
									</option>
								))
							}
						</optgroup>
					)
				}

				{
					system.length > 0 && (
						<optgroup label='System'>
							{
								system.map((o, i) => (
									<option
										key={'s' + i}
										value={o.name}
										style={optionStyle(o.name)}
									>
										{o.label}
									</option>
								))
							}
						</optgroup>
					)
				}
			</select>

			{
				desc && <div className='inspector-desc'>{desc}</div>
			}
		</div>
	);
}