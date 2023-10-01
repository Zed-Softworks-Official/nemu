/**
 * Joins variable amount of classnames into one string
 * 
 * @param classes - css classnames
 * @returns {string} Classnames all joined together in one string
 */
export default function classNames(...classes: any) {
    return classes.filter(Boolean).join(' ');
}