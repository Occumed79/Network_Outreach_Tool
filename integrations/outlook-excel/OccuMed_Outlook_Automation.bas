Attribute VB_Name = "OccuMed_Outlook_Automation"
Option Explicit

Private Const SHEET_QUEUE As String = "Send Queue"
Private Const MATT_EMAIL As String = "mcaskey@occu-med.com"

Private Const COL_TO As Long = 8
Private Const COL_CC As Long = 9
Private Const COL_SUBJECT As Long = 10
Private Const COL_BODY As Long = 11
Private Const COL_AGREEMENT As Long = 12
Private Const COL_STATUS As Long = 14

Private mOutlook As Object

Public Sub TestActiveRow()
    Dim ws As Worksheet
    Dim r As Long

    Set ws = ThisWorkbook.Worksheets(SHEET_QUEUE)
    If ActiveSheet.Name <> SHEET_QUEUE Then
        MsgBox "Go to the Send Queue sheet and select the row you want to test.", vbInformation
        Exit Sub
    End If

    r = ActiveCell.Row
    If r < 2 Then Exit Sub

    Call CreateEmailForRow(ws, r, "DISPLAY")
End Sub

Public Sub DraftAllReady()
    Dim ws As Worksheet
    Dim lastRow As Long, r As Long, created As Long

    Set ws = ThisWorkbook.Worksheets(SHEET_QUEUE)
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    For r = 2 To lastRow
        If UCase$(Trim$(CStr(ws.Cells(r, COL_STATUS).Value))) = "READY" Then
            If CreateEmailForRow(ws, r, "DRAFT") Then created = created + 1
        End If
        DoEvents
    Next r

    ThisWorkbook.Save
    MsgBox created & " Outlook draft(s) created.", vbInformation
End Sub

Public Sub SendAllReady()
    Dim ws As Worksheet
    Dim lastRow As Long, r As Long, sent As Long
    Dim confirmation As String

    Set ws = ThisWorkbook.Worksheets(SHEET_QUEUE)

    confirmation = InputBox( _
        "This sends every READY row as an individual Outlook email." & vbCrLf & _
        "Matt Caskey will be CC'd on every message." & vbCrLf & vbCrLf & _
        "Type SEND ALL READY to continue.", _
        "FINAL SEND CONFIRMATION")

    If confirmation <> "SEND ALL READY" Then Exit Sub

    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    For r = 2 To lastRow
        If UCase$(Trim$(CStr(ws.Cells(r, COL_STATUS).Value))) = "READY" Then
            If CreateEmailForRow(ws, r, "SEND") Then sent = sent + 1
        End If
        DoEvents
    Next r

    ThisWorkbook.Save
    MsgBox sent & " email(s) sent.", vbInformation
End Sub

Private Function CreateEmailForRow(ByVal ws As Worksheet, ByVal r As Long, ByVal actionMode As String) As Boolean
    On Error GoTo RowError

    Dim olApp As Object, mail As Object
    Dim toEmail As String, ccEmail As String
    Dim subjectText As String, bodyText As String
    Dim agreementPath As String

    toEmail = Trim$(CStr(ws.Cells(r, COL_TO).Value))
    ccEmail = Trim$(CStr(ws.Cells(r, COL_CC).Value))
    subjectText = CStr(ws.Cells(r, COL_SUBJECT).Value)
    bodyText = CStr(ws.Cells(r, COL_BODY).Value)
    agreementPath = Trim$(CStr(ws.Cells(r, COL_AGREEMENT).Value))

    If Len(toEmail) = 0 Then
        ws.Cells(r, COL_STATUS).Value = "NEEDS EMAIL"
        Exit Function
    End If

    If InStr(1, ccEmail, MATT_EMAIL, vbTextCompare) = 0 Then
        If Len(ccEmail) > 0 Then
            ccEmail = ccEmail & "; " & MATT_EMAIL
        Else
            ccEmail = MATT_EMAIL
        End If
        ws.Cells(r, COL_CC).Value = ccEmail
    End If

    Set olApp = GetOutlook()
    If olApp Is Nothing Then Exit Function

    Set mail = olApp.CreateItem(0)

    With mail
        .To = toEmail
        .CC = ccEmail
        .Subject = subjectText
        .Body = bodyText

        If Len(agreementPath) > 0 And Dir(agreementPath) <> "" Then
            .Attachments.Add agreementPath
        End If

        Select Case UCase$(actionMode)
            Case "DISPLAY"
                .Display
            Case "DRAFT"
                .Save
                ws.Cells(r, COL_STATUS).Value = "DRAFTED"
            Case "SEND"
                .Send
                ws.Cells(r, COL_STATUS).Value = "SENT"
        End Select
    End With

    CreateEmailForRow = True
    Exit Function

RowError:
    ws.Cells(r, COL_STATUS).Value = "ERROR"
    CreateEmailForRow = False
End Function

Private Function GetOutlook() As Object
    On Error Resume Next

    If mOutlook Is Nothing Then
        Set mOutlook = GetObject(, "Outlook.Application")
        If mOutlook Is Nothing Then Set mOutlook = CreateObject("Outlook.Application")
    End If

    Set GetOutlook = mOutlook
    On Error GoTo 0
End Function
