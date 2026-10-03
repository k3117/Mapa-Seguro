"""Gera um PDF sintético com o mesmo layout textual do demonstrativo da SSP-GO (apenas para testar o parser)."""
import sys
from reportlab.lib.pagesizes import landscape, A4
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
st = getSampleStyleSheet()
cab = ["NATUREZAS","JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ","TOTAL"]
linhas = [cab,
 ["HOMICÍDIO DOLOSO",*map(str,[70,67,75,62,62,56,62,59,60,56,60,67]),"756"],
 ["FEMINICÍDIO",*map(str,[1,3,7,5,4,2,8,4,7,5,5,9]),"60"],
 ["ESTUPRO",*map(str,[54,39,71,74,68,59,53,67,61,77,75,57]),"755"],
 ["FURTO EM RESIDÊNCIA","1.097","968","1.090","1.009","1.014","983","992","997","937","959","963","975","11.984"]]
t = Table(linhas); t.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.5,colors.black)]))
doc = SimpleDocTemplate(sys.argv[1], pagesize=landscape(A4))
doc.build([Paragraph("ESTATÍSTICAS CRIMINAIS E DE PRODUTIVIDADE - ESTADO DE GOIÁS", st["Title"]),
           Paragraph("DEMONSTRATIVO - ANO 2025", st["Heading2"]), t,
           Paragraph("1- FONTE: ODISSEU (RAI) DATA DE CONSULTA - DATA 10/04/2026;", st["Normal"])])
