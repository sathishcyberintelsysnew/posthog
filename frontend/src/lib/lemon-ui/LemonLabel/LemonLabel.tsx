import './LemonLabel.scss'
import { Tooltip } from '../Tooltip'
import { IconInfo } from 'lib/lemon-ui/icons'
import clsx from 'clsx'
import { Link, LinkProps } from '../Link'

export interface LemonLabelProps
    extends Pick<React.LabelHTMLAttributes<HTMLLabelElement>, 'htmlFor' | 'form' | 'children' | 'className'> {
    info?: React.ReactNode
    infoLink?: LinkProps['to']
    showOptional?: boolean
    onExplanationClick?: () => void
}

export function LemonLabel({
    children,
    info,
    className,
    showOptional,
    onExplanationClick,
    infoLink,
    ...props
}: LemonLabelProps): JSX.Element {
    return (
        <label className={clsx('LemonLabel', className)} {...props}>
            {children}

            {showOptional ? <span className="LemonLabel__extra">(optional)</span> : null}

            {onExplanationClick ? (
                <a onClick={onExplanationClick}>
                    <span className="LemonLabel__extra">(what is this?)</span>
                </a>
            ) : null}

            {info ? (
                <Tooltip title={info}>
                    <Link to={infoLink} target="_blank" className="inline-flex">
                        <IconInfo className="text-xl text-muted-alt shrink-0" />
                    </Link>
                </Tooltip>
            ) : null}
        </label>
    )
}
