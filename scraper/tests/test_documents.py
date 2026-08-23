import unittest

from documents import _extract_document_links, classify_document


CAIXA_HTML = """
<span><a href="#" onclick="javascript:ExibeDoc('/editais/matricula/SP/0000010306957.pdf')">Baixar matrícula do imóvel</a></span>
<li><span><a href="#" onclick="javascript:ExibeDoc('/editais/EL00400226CPARE.PDF')"><strong>Baixar edital e anexos</strong></a></span></li>
<a href="/editais/regras-VOL/comocomprar.pdf?v=01">Como comprar</a>
"""

BASE_URL = "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10306957"


class ExtractDocumentLinksTests(unittest.TestCase):
    def test_parses_exibedoc_onclick_links(self):
        docs = _extract_document_links(CAIXA_HTML, BASE_URL)
        urls = {d["url"] for d in docs}
        self.assertIn("https://venda-imoveis.caixa.gov.br/editais/matricula/SP/0000010306957.pdf", urls)
        self.assertIn("https://venda-imoveis.caixa.gov.br/editais/EL00400226CPARE.PDF", urls)

    def test_excludes_boilerplate_comocomprar(self):
        docs = _extract_document_links(CAIXA_HTML, BASE_URL)
        urls = {d["url"] for d in docs}
        self.assertFalse(any("comocomprar" in u.lower() for u in urls))

    def test_classifies_types_from_url_and_label(self):
        docs = _extract_document_links(CAIXA_HTML, BASE_URL)
        by_url = {d["url"]: d for d in docs}
        matricula = by_url["https://venda-imoveis.caixa.gov.br/editais/matricula/SP/0000010306957.pdf"]
        edital = by_url["https://venda-imoveis.caixa.gov.br/editais/EL00400226CPARE.PDF"]
        self.assertEqual(matricula["type"], "matricula")
        self.assertEqual(edital["type"], "edital")


class ClassifyDocumentTests(unittest.TestCase):
    def test_matricula_by_url_path(self):
        self.assertEqual(classify_document("/editais/matricula/SP/x.pdf", None), "matricula")

    def test_edital_by_label(self):
        self.assertEqual(classify_document("/editais/EL00400226CPARE.PDF", "Baixar edital e anexos"), "edital")


if __name__ == "__main__":
    unittest.main()
