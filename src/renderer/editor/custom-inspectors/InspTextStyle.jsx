import {
	MdFormatAlignLeft, MdFormatAlignCenter, MdFormatAlignRight
} from 'react-icons/md';
import { 
	AiOutlineVerticalAlignTop,
	AiOutlineVerticalAlignMiddle,
	AiOutlineVerticalAlignBottom
} from "react-icons/ai";

export default function InspTextStyle({
	objects, 
	field, 
	type, 
	getCurrentValueOf,
	commitValueOf
}) {
	
	const drawButton = (content, activeCondition, onClick, title = '') => {
		const classes = ['tool-option', 'no-select'];
		
		if(activeCondition() == true)
			classes.push('tool-option--active');
		
		return (
			<div 
				className={classes.join(' ')}
				onClick={onClick} 
				title={title}
				tabIndex={0}
			>
				{content}
			</div>
		)
	}
	const getVal = fid => {
		const { current, mixed } = getCurrentValueOf(fid);
		if(mixed) return DASH;
		return current;
	};
	const setVal = (fid, val) => commitValueOf({fieldId: fid, val});
	
	return (
		<>
			<div className='text-style-row'>
				<div className='text-style-editor'>
					{
						drawButton(
							(<b>B</b>),
							() => getVal('fontWeight') == 'bold',
							() => {
								const val = getVal('fontWeight');
								
								setVal('fontWeight', val == 'bold' ? 'normal' : 'bold');
							}
						)
					}
					{
						drawButton(
							(<i>i</i>),
							() => getVal('fontStyle') == 'italic',
							() => {
								const val = getVal('fontStyle');
								
								setVal('fontStyle', val == 'italic' ? 'normal' : 'italic');
							}
						)
					}
					<div style={{width: 15}}></div>
					{
						drawButton(
							(<MdFormatAlignLeft />),
							() => getVal('align') == 'left',
							() => setVal('align', 'left')
						)
					}
					{
						drawButton(
							(<MdFormatAlignCenter />),
							() => getVal('align') == 'center',
							() => setVal('align', 'center')
						)
					}
					{
						drawButton(
							(<MdFormatAlignRight />),
							() => getVal('align') == 'right',
							() => setVal('align', 'right')
						)
					}
				</div>
			</div>
			<div className='text-style-row'>
				<div className='text-style-editor'>
					{
						drawButton(
							(<AiOutlineVerticalAlignTop />),
							() => getVal('valign') == 'top',
							() => setVal('valign', 'top')
						)
					}
					{
						drawButton(
							(<AiOutlineVerticalAlignMiddle />),
							() => getVal('valign') == 'middle',
							() => setVal('valign', 'middle')
						)
					}
					{
						drawButton(
							(<AiOutlineVerticalAlignBottom />),
							() => getVal('valign') == 'bottom',
							() => setVal('valign', 'bottom')
						)
					}
				</div>
			</div>
		</>
	);
}