/**
 * Removes hierarchy metadata from sentences
 * Used when user wants to clear the hierarchy
 */
export function dummyTree() {
    const tree = {
        id: "root",
        label: "Root node",
        color: "#4a90e2",
        emotion: "NEUTRAL",
        isDirty: false,
        children: [
            {
            id: "child1",
            label: "First child",
            color: "#50e3c2",
            emotion: "POSITIVE",
            isDirty: false,
            children: []
            },
            {
            id: "child2",
            label: "Second child",
            color: "#f5a623",
            emotion: "NEGATIVE",
            isDirty: true,
            children: [
                {
                id: "grandchild1",
                label: "Nested node",
                color: "#b8e986",
                emotion: "POSITIVE",
                isDirty: false,
                children: []
                }
            ]
            }
        ]
        };
    return tree;
}
