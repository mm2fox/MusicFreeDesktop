import { shellUtil } from "@shared/utils/renderer";

export default function A(
    props: React.DetailedHTMLProps<
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
        HTMLAnchorElement
    >,
) {
    const { href, onClick, ...restProps } = props;

    return (
        <a
            {...restProps}
            href={href ? "#" : undefined}
            role="button"
            onClick={(e) => {
                if (href) {
                    e.preventDefault();
                    shellUtil.openExternal(href);
                }
                onClick?.(e);
            }}
        ></a>
    );
}
