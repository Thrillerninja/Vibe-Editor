export async function importTxt (file) {
    if (!file) {
        alert("No file selected for import!");
        return; 
    }

    const buf = await file.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf);
    return text;
}