from comsats_scraper import refresh_comsats_knowledge


if __name__ == "__main__":
    data = refresh_comsats_knowledge()
    print(
        f"Updated COMSATS knowledge: "
        f"{data.get('page_count', 0)} pages, "
        f"{data.get('chunk_count', 0)} chunks"
    )

    # Rebuild the ChromaDB vector store from the fresh scrape
    from rag_store import rag_store
    count = rag_store.ingest_from_knowledge_file(force=True)
    print(f"ChromaDB re-indexed: {count} vectors ({rag_store.embedder_name})")
    if data.get("errors"):
        print("Some pages could not be scraped:")
        for err in data["errors"]:
            print(f"- {err['url']}: {err['error']}")
